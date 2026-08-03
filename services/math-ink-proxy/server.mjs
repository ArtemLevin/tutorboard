import { randomUUID } from "node:crypto";
import http from "node:http";
import { isIP } from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { mathInkProxyLimits, mathInkProxyServiceVersion } from "./contract.mjs";
import { createFormulaRecognitionGatewayService } from "./service.mjs";

function integerEnvironment(
  name,
  fallback,
  maximum,
  environment = process.env,
) {
  const raw = environment[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(
      `${name} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

function nonNegativeIntegerEnvironment(
  name,
  fallback,
  maximum,
  environment = process.env,
) {
  const raw = environment[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(
      `${name} must be a non-negative integer no greater than ${maximum}.`,
    );
  }
  return value;
}

function booleanEnvironment(name, fallback = false, environment = process.env) {
  const raw = environment[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true, false, 1 or 0.`);
}

function optionalEnvironment(name, environment = process.env) {
  const value = environment[name];
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

function normalizedIpAddress(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  const candidate = value.startsWith("::ffff:") ? value.slice(7) : value;
  return isIP(candidate) === 0 ? null : candidate;
}

function clientKey(request, trustedProxyHops) {
  const remoteAddress =
    normalizedIpAddress(request.socket.remoteAddress) ?? "unknown";
  if (trustedProxyHops === 0) return remoteAddress.slice(0, 128);

  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded !== "string" || forwarded.length === 0) {
    return remoteAddress.slice(0, 128);
  }
  const hops = forwarded
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const candidateIndex = hops.length - trustedProxyHops;
  if (candidateIndex < 0) return remoteAddress.slice(0, 128);
  return (normalizedIpAddress(hops[candidateIndex]) ?? remoteAddress).slice(
    0,
    128,
  );
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
  const trustedProxyHops = options.trustedProxyHops ?? 0;
  if (
    !Number.isSafeInteger(trustedProxyHops) ||
    trustedProxyHops < 0 ||
    trustedProxyHops > 16
  ) {
    throw new RangeError(
      "Trusted proxy hops must be a non-negative integer no greater than 16.",
    );
  }
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
        clientKey: clientKey(request, trustedProxyHops),
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

function runtimeProviderUrl(
  name,
  value,
  { allowInsecure = false, allowedHost } = {},
) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`${name} must be a valid absolute URL.`, { cause: error });
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `${name} cannot contain credentials, query or fragment data.`,
    );
  }
  if (allowInsecure) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`${name} must use HTTP or HTTPS.`);
    }
  } else if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS.`);
  }
  if (allowedHost !== undefined && url.hostname !== allowedHost) {
    throw new Error(`${name} must use ${allowedHost}.`);
  }
  return url.toString();
}

export function runtimeProviders(environment = process.env) {
  if (
    optionalEnvironment(
      "FORMULA_RECOGNITION_ALLOW_INSECURE_UPSTREAM",
      environment,
    ) !== undefined
  ) {
    throw new Error(
      "FORMULA_RECOGNITION_ALLOW_INSECURE_UPSTREAM is unsupported. Use a provider-specific insecure-upstream setting.",
    );
  }

  const paddleApiUrl = optionalEnvironment("PADDLE_OCR_API_URL", environment);
  const paddleAllowInsecure = booleanEnvironment(
    "PADDLE_OCR_ALLOW_INSECURE_UPSTREAM",
    false,
    environment,
  );
  const localApiUrl = optionalEnvironment("LOCAL_OCR_LLM_API_URL", environment);
  const localModel = optionalEnvironment("LOCAL_OCR_LLM_MODEL", environment);
  const localAllowInsecure = booleanEnvironment(
    "LOCAL_OCR_LLM_ALLOW_INSECURE_UPSTREAM",
    false,
    environment,
  );
  const yandexFolderId = optionalEnvironment("YANDEX_FOLDER_ID", environment);
  const yandexApiKey = optionalEnvironment("YANDEX_API_KEY", environment);
  const yandexIamToken = optionalEnvironment("YANDEX_IAM_TOKEN", environment);
  const yandexAllowInsecure = booleanEnvironment(
    "YANDEX_OCR_ALLOW_INSECURE_UPSTREAM",
    false,
    environment,
  );
  const yandexApiUrl =
    optionalEnvironment("YANDEX_OCR_API_URL", environment) ??
    "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText";

  return {
    ...(paddleApiUrl === undefined
      ? {}
      : {
          paddleocr: {
            allowInsecure: paddleAllowInsecure,
            apiUrl: runtimeProviderUrl("PADDLE_OCR_API_URL", paddleApiUrl, {
              allowInsecure: paddleAllowInsecure,
            }),
            token: optionalEnvironment("PADDLE_OCR_API_TOKEN", environment),
          },
        }),
    ...(localApiUrl === undefined || localModel === undefined
      ? {}
      : {
          "local-ocr-llm": {
            allowInsecure: localAllowInsecure,
            apiKey: optionalEnvironment("LOCAL_OCR_LLM_API_KEY", environment),
            apiUrl: runtimeProviderUrl("LOCAL_OCR_LLM_API_URL", localApiUrl, {
              allowInsecure: localAllowInsecure,
            }),
            model: localModel,
          },
        }),
    ...(yandexFolderId === undefined ||
    (yandexApiKey === undefined && yandexIamToken === undefined)
      ? {}
      : {
          "yandex-ai-studio": {
            allowInsecure: yandexAllowInsecure,
            apiKey: yandexApiKey,
            apiUrl: runtimeProviderUrl("YANDEX_OCR_API_URL", yandexApiUrl, {
              allowInsecure: yandexAllowInsecure,
              ...(yandexAllowInsecure
                ? {}
                : { allowedHost: "ocr.api.cloud.yandex.net" }),
            }),
            folderId: yandexFolderId,
            iamToken: yandexIamToken,
          },
        }),
  };
}

function runtimeService(environment = process.env) {
  return createFormulaRecognitionGatewayService({
    maximumConcurrentRequests: integerEnvironment(
      "FORMULA_RECOGNITION_MAX_CONCURRENCY",
      4,
      64,
      environment,
    ),
    providerAttemptTimeoutMs: integerEnvironment(
      "FORMULA_RECOGNITION_PROVIDER_TIMEOUT_MS",
      15_000,
      60_000,
      environment,
    ),
    providers: runtimeProviders(environment),
    rateLimitPerWindow: integerEnvironment(
      "FORMULA_RECOGNITION_RATE_LIMIT",
      30,
      10_000,
      environment,
    ),
    rateLimitWindowMs: integerEnvironment(
      "FORMULA_RECOGNITION_RATE_WINDOW_MS",
      60_000,
      3_600_000,
      environment,
    ),
    retryDelayMs: integerEnvironment(
      "FORMULA_RECOGNITION_RETRY_DELAY_MS",
      150,
      2_000,
      environment,
    ),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = integerEnvironment(
    "FORMULA_RECOGNITION_GATEWAY_PORT",
    8787,
    65_535,
  );
  const trustedProxyHops = nonNegativeIntegerEnvironment(
    "FORMULA_RECOGNITION_TRUSTED_PROXY_HOPS",
    0,
    16,
  );
  const service = runtimeService();
  const server = createFormulaRecognitionGatewayHttpServer({
    service,
    trustedProxyHops,
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(
      JSON.stringify({
        event: "formula-recognition.gateway-started",
        port,
        providers: service.configuredProviders,
        trustedProxyHops,
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
