import { randomUUID } from "node:crypto";
import http from "node:http";
import process from "node:process";

import { mathInkProxyLimits, mathInkProxyServiceVersion } from "./contract.mjs";
import {
  createMathInkProxyService,
  createUnconfiguredMathInkProxyService,
} from "./service.mjs";

function integerEnvironment(name, fallback, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(
      `${name} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

function booleanEnvironment(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true, false, 1 or 0.`);
}

function jsonResponse(response, status, body, additionalHeaders = {}) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(encoded),
    "Content-Type":
      status >= 400
        ? "application/problem+json; charset=utf-8"
        : "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...additionalHeaders,
  });
  response.end(encoded);
}

function requestIdentifier(request) {
  const supplied = request.headers["x-tutorboard-request-id"];
  if (
    typeof supplied === "string" &&
    supplied.length > 0 &&
    supplied.length <= 256 &&
    /^[A-Za-z0-9:._-]+$/u.test(supplied)
  ) {
    return supplied;
  }
  return `proxy:${randomUUID()}`;
}

function clientKey(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",", 1)[0].trim().slice(0, 128);
  }
  return request.socket.remoteAddress?.slice(0, 128) ?? "unknown";
}

async function readJsonBody(request, maximumBytes) {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    return { status: "wrong-content-type" };
  }
  const declared = request.headers["content-length"];
  if (declared !== undefined) {
    const parsed = Number(declared);
    if (Number.isFinite(parsed) && parsed > maximumBytes) {
      return { status: "too-large" };
    }
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maximumBytes) return { status: "too-large" };
    chunks.push(bytes);
  }
  try {
    return {
      status: "ok",
      value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
  } catch {
    return { status: "invalid-json" };
  }
}

function localProblem(requestId, code, status, title, detail, retryable) {
  return {
    code,
    detail,
    requestId,
    retryable,
    status,
    title,
    type: `https://tutorboard.local/problems/${code}`,
  };
}

export function createMathInkProxyHttpServer(options) {
  const { configured, service } = options;
  return http.createServer(async (request, response) => {
    const requestId = requestIdentifier(request);
    response.setHeader("X-TutorBoard-Request-Id", requestId);

    if (request.method === "GET" && request.url === "/healthz") {
      jsonResponse(response, 200, {
        service: "tutorboard-math-ink-proxy",
        status: "ok",
        version: mathInkProxyServiceVersion,
      });
      return;
    }
    if (request.method === "GET" && request.url === "/readyz") {
      jsonResponse(
        response,
        configured ? 200 : 503,
        configured
          ? {
              provider: "mathpix",
              service: "tutorboard-math-ink-proxy",
              status: "ready",
              version: mathInkProxyServiceVersion,
            }
          : localProblem(
              requestId,
              "math-ink.proxy-unconfigured",
              503,
              "Proxy unconfigured",
              "Mathpix credentials are not configured.",
              false,
            ),
      );
      return;
    }
    if (request.url !== "/v1/recognize") {
      jsonResponse(
        response,
        404,
        localProblem(
          requestId,
          "math-ink.route-not-found",
          404,
          "Route not found",
          "The requested proxy route does not exist.",
          false,
        ),
      );
      return;
    }
    if (request.method !== "POST") {
      jsonResponse(
        response,
        405,
        localProblem(
          requestId,
          "math-ink.method-not-allowed",
          405,
          "Method not allowed",
          "Use POST for recognition requests.",
          false,
        ),
        { Allow: "POST" },
      );
      return;
    }

    const body = await readJsonBody(
      request,
      mathInkProxyLimits.maximumBodyBytes,
    );
    if (body.status !== "ok") {
      const tooLarge = body.status === "too-large";
      jsonResponse(
        response,
        tooLarge ? 413 : 400,
        localProblem(
          requestId,
          tooLarge ? "math-ink.request-too-large" : "math-ink.invalid-request",
          tooLarge ? 413 : 400,
          tooLarge ? "Request too large" : "Invalid request",
          body.status === "wrong-content-type"
            ? "Content-Type must be application/json."
            : body.status === "invalid-json"
              ? "The request body is not valid JSON."
              : "The request body exceeds the proxy limit.",
          false,
        ),
      );
      return;
    }

    const controller = new AbortController();
    request.once("aborted", () => controller.abort());
    response.once("close", () => {
      if (!response.writableEnded) controller.abort();
    });
    try {
      const result = await service.recognize({
        clientKey: clientKey(request),
        request: body.value,
        requestId,
        signal: controller.signal,
      });
      if (controller.signal.aborted || response.destroyed) return;
      jsonResponse(response, result.status, result.body, result.headers);
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) return;
      console.error(
        JSON.stringify({
          event: "math-ink.unhandled-error",
          message: error instanceof Error ? error.message : "Unknown error",
          requestId,
        }),
      );
      jsonResponse(
        response,
        500,
        localProblem(
          requestId,
          "math-ink.internal-error",
          500,
          "Internal error",
          "The recognition proxy could not complete the request.",
          true,
        ),
      );
    }
  });
}

function runtimeService() {
  const appId = process.env.MATHPIX_APP_ID;
  const appKey = process.env.MATHPIX_APP_KEY;
  if (
    appId === undefined ||
    appId === "" ||
    appKey === undefined ||
    appKey === ""
  ) {
    return {
      configured: false,
      service: createUnconfiguredMathInkProxyService(),
    };
  }
  return {
    configured: true,
    service: createMathInkProxyService({
      allowInsecureUpstream: booleanEnvironment(
        "MATH_INK_ALLOW_INSECURE_UPSTREAM",
      ),
      apiUrl: process.env.MATHPIX_API_URL,
      appId,
      appKey,
      maximumConcurrentRequests: integerEnvironment(
        "MATH_INK_MAX_CONCURRENCY",
        4,
        64,
      ),
      providerAttemptTimeoutMs: integerEnvironment(
        "MATH_INK_PROVIDER_TIMEOUT_MS",
        10_000,
        60_000,
      ),
      rateLimitPerWindow: integerEnvironment("MATH_INK_RATE_LIMIT", 30, 10_000),
      rateLimitWindowMs: integerEnvironment(
        "MATH_INK_RATE_WINDOW_MS",
        60_000,
        3_600_000,
      ),
      retryDelayMs: integerEnvironment("MATH_INK_RETRY_DELAY_MS", 150, 2_000),
    }),
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = integerEnvironment("MATH_INK_PROXY_PORT", 8787, 65_535);
  const runtime = runtimeService();
  const server = createMathInkProxyHttpServer(runtime);
  server.listen(port, "0.0.0.0", () => {
    console.log(
      JSON.stringify({
        configured: runtime.configured,
        event: "math-ink.proxy-started",
        port,
        version: mathInkProxyServiceVersion,
      }),
    );
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
