import { randomUUID } from "node:crypto";
import http from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { mathInkProxyLimits, mathInkProxyServiceVersion } from "./contract.mjs";
import { createFormulaRecognitionGatewayService } from "./service.mjs";

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

function optionalEnvironment(name) {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
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
  return `formula:${randomUUID()}`;
}

function clientKey(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const hops = forwarded.split(",");
    return (hops.at(-1)?.trim() || "unknown").slice(0, 128);
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

export function createFormulaRecognitionGatewayHttpServer(options) {
  const { service } = options;
  return http.createServer(async (request, response) => {
    const requestId = requestIdentifier(request);
    response.setHeader("X-TutorBoard-Request-Id", requestId);

    if (request.method === "GET" && request.url === "/healthz") {
      jsonResponse(response, 200, {
        service: "tutorboard-formula-recognition-gateway",
        status: "ok",
        version: mathInkProxyServiceVersion,
      });
      return;
    }
    if (request.method === "GET" && request.url === "/readyz") {
      const ready = Object.values(service.configuredProviders).some(Boolean);
      jsonResponse(
        response,
        ready ? 200 : 503,
        ready
          ? {
              providers: service.configuredProviders,
              service: "tutorboard-formula-recognition-gateway",
              status: "ready",
              version: mathInkProxyServiceVersion,
            }
          : localProblem(
              requestId,
              "formula-recognition.gateway-unconfigured",
              503,
              "Gateway unconfigured",
              "No formula recognition provider is configured.",
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
          "formula-recognition.route-not-found",
          404,
          "Route not found",
          "The requested gateway route does not exist.",
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
          "formula-recognition.method-not-allowed",
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
          tooLarge
            ? "formula-recognition.request-too-large"
            : "formula-recognition.invalid-request",
          tooLarge ? 413 : 400,
          tooLarge ? "Request too large" : "Invalid request",
          body.status === "wrong-content-type"
            ? "Content-Type must be application/json."
            : body.status === "invalid-json"
              ? "The request body is not valid JSON."
              : "The request body exceeds the gateway limit.",
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
          event: "formula-recognition.unhandled-error",
          message: error instanceof Error ? error.message : "Unknown error",
          requestId,
        }),
      );
      jsonResponse(
        response,
        500,
        localProblem(
          requestId,
          "formula-recognition.internal-error",
          500,
          "Internal error",
          "The recognition gateway could not complete the request.",
          true,
        ),
      );
    }
  });
}

export const createMathInkProxyHttpServer =
  createFormulaRecognitionGatewayHttpServer;

function runtimeProviders() {
  const allowInsecure = booleanEnvironment(
    "FORMULA_RECOGNITION_ALLOW_INSECURE_UPSTREAM",
  );
  const paddleApiUrl = optionalEnvironment("PADDLE_OCR_API_URL");
  const localApiUrl = optionalEnvironment("LOCAL_OCR_LLM_API_URL");
  const localModel = optionalEnvironment("LOCAL_OCR_LLM_MODEL");
  const yandexFolderId = optionalEnvironment("YANDEX_FOLDER_ID");
  const yandexApiKey = optionalEnvironment("YANDEX_API_KEY");
  const yandexIamToken = optionalEnvironment("YANDEX_IAM_TOKEN");
  return {
    ...(paddleApiUrl === undefined
      ? {}
      : {
          paddleocr: {
            allowInsecure,
            apiUrl: paddleApiUrl,
            token: optionalEnvironment("PADDLE_OCR_API_TOKEN"),
          },
        }),
    ...(localApiUrl === undefined || localModel === undefined
      ? {}
      : {
          "local-ocr-llm": {
            allowInsecure,
            apiKey: optionalEnvironment("LOCAL_OCR_LLM_API_KEY"),
            apiUrl: localApiUrl,
            model: localModel,
          },
        }),
    ...(yandexFolderId === undefined ||
    (yandexApiKey === undefined && yandexIamToken === undefined)
      ? {}
      : {
          "yandex-ai-studio": {
            allowInsecure,
            apiKey: yandexApiKey,
            apiUrl: optionalEnvironment("YANDEX_OCR_API_URL"),
            folderId: yandexFolderId,
            iamToken: yandexIamToken,
          },
        }),
  };
}

function runtimeService() {
  return createFormulaRecognitionGatewayService({
    maximumConcurrentRequests: integerEnvironment(
      "FORMULA_RECOGNITION_MAX_CONCURRENCY",
      4,
      64,
    ),
    providerAttemptTimeoutMs: integerEnvironment(
      "FORMULA_RECOGNITION_PROVIDER_TIMEOUT_MS",
      15_000,
      60_000,
    ),
    providers: runtimeProviders(),
    rateLimitPerWindow: integerEnvironment(
      "FORMULA_RECOGNITION_RATE_LIMIT",
      30,
      10_000,
    ),
    rateLimitWindowMs: integerEnvironment(
      "FORMULA_RECOGNITION_RATE_WINDOW_MS",
      60_000,
      3_600_000,
    ),
    retryDelayMs: integerEnvironment(
      "FORMULA_RECOGNITION_RETRY_DELAY_MS",
      150,
      2_000,
    ),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = integerEnvironment(
    "FORMULA_RECOGNITION_GATEWAY_PORT",
    8787,
    65_535,
  );
  const service = runtimeService();
  const server = createFormulaRecognitionGatewayHttpServer({ service });
  server.listen(port, "0.0.0.0", () => {
    console.log(
      JSON.stringify({
        event: "formula-recognition.gateway-started",
        port,
        providers: service.configuredProviders,
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
