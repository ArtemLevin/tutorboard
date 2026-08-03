import {
  mathInkProxyLimits,
  normalizeLocalOcrLlmResponse,
  normalizePaddleOcrResponse,
  normalizeYandexOcrResponse,
  validateFormulaRecognitionRequest,
} from "./contract.mjs";

const transientProviderStatuses = new Set([429, 502, 503, 504]);
const problemTypeBase = "https://tutorboard.local/problems/";
const localOcrSystemPrompt =
  "Recognize the mathematical formula in the image. Return exactly one LaTeX expression without Markdown fences, explanation, prose or surrounding delimiters.";

function positiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(
      `${label} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

function providerUrl(value, { allowInsecure = false, allowedHost } = {}) {
  const url = new URL(value);
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError("Provider URL cannot contain credentials, query or fragment data.");
  }
  if (allowInsecure) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Provider URL must use HTTP or HTTPS.");
    }
  } else if (url.protocol !== "https:") {
    throw new TypeError("Provider URL must use HTTPS.");
  }
  if (allowedHost !== undefined && url.hostname !== allowedHost) {
    throw new TypeError(`Provider URL must use ${allowedHost}.`);
  }
  return url;
}

function defaultSleep(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("Operation aborted."));
      return;
    }
    let timer;
    let settled = false;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason ?? new Error("Operation aborted."));
    };
    timer = setTimeout(finish, delayMs);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function readBoundedResponse(response, maximumBytes) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (Number.isFinite(parsed) && parsed > maximumBytes) {
      await response.body?.cancel().catch(() => undefined);
      return { status: "too-large" };
    }
  }
  if (response.body === null) return { status: "ok", text: "" };
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "too-large" };
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      status: "ok",
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { status: "invalid-utf8" };
  }
}

function parseJson(text) {
  try {
    return { parsed: true, value: JSON.parse(text) };
  } catch {
    return { parsed: false };
  }
}

function responseContentType(response) {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
}

function problem(code, status, title, detail, retryable, requestId) {
  return {
    body: {
      code,
      detail,
      requestId,
      retryable,
      status,
      title,
      type: `${problemTypeBase}${code}`,
    },
    status,
  };
}

function safeLog(logger, value) {
  try {
    logger(value);
  } catch {
    // Diagnostics cannot affect request processing.
  }
}

function retryAfterMs(response, fallbackMs) {
  const value = response.headers.get("retry-after");
  if (value === null || !/^\d+(?:\.\d+)?$/u.test(value.trim())) {
    return fallbackMs;
  }
  return Math.min(2_000, Math.max(0, Math.round(Number(value) * 1_000)));
}

function createRateGuard(limit, windowMs, now) {
  const clients = new Map();
  return (clientKey) => {
    const timestamp = now();
    const current = clients.get(clientKey);
    if (current === undefined || current.resetAt <= timestamp) {
      clients.set(clientKey, { count: 1, resetAt: timestamp + windowMs });
      return { allowed: true };
    }
    if (current.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.resetAt - timestamp) / 1_000),
        ),
      };
    }
    current.count += 1;
    if (clients.size > 10_000) {
      for (const [key, record] of clients) {
        if (record.resetAt <= timestamp) clients.delete(key);
      }
    }
    return { allowed: true };
  };
}

function createAttemptSignal(callerSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(callerSignal.reason);
  if (callerSignal.aborted) abort();
  else callerSignal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    cleanup: () => {
      clearTimeout(timer);
      callerSignal.removeEventListener("abort", abort);
    },
    signal: controller.signal,
    timedOut: () => timedOut,
  };
}

function configuredProvider(config) {
  return config !== undefined && config !== null;
}

function paddleRequest(config, request) {
  return {
    body: JSON.stringify({
      imageBase64: request.image.data,
      mimeType: request.image.mimeType,
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(config.token === undefined
        ? {}
        : { Authorization: `Bearer ${config.token}` }),
    },
    normalize: normalizePaddleOcrResponse,
    url: providerUrl(config.apiUrl, {
      allowInsecure: config.allowInsecure === true,
    }),
  };
}

function localOcrLlmRequest(config, request) {
  return {
    body: JSON.stringify({
      max_tokens: 512,
      messages: [
        { content: localOcrSystemPrompt, role: "system" },
        {
          content: [
            {
              text: "Return the formula as LaTeX.",
              type: "text",
            },
            {
              image_url: {
                url: `data:${request.image.mimeType};base64,${request.image.data}`,
              },
              type: "image_url",
            },
          ],
          role: "user",
        },
      ],
      model: config.model,
      stream: false,
      temperature: 0,
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(config.apiKey === undefined
        ? {}
        : { Authorization: `Bearer ${config.apiKey}` }),
    },
    normalize: normalizeLocalOcrLlmResponse,
    url: providerUrl(config.apiUrl, {
      allowInsecure: config.allowInsecure === true,
    }),
  };
}

function yandexRequest(config, request) {
  const authorization =
    config.apiKey !== undefined
      ? `Api-Key ${config.apiKey}`
      : `Bearer ${config.iamToken}`;
  return {
    body: JSON.stringify({
      content: request.image.data,
      languageCodes: ["*"] ,
      mimeType: request.image.mimeType,
      model: "math-markdown",
    }),
    headers: {
      Accept: "application/json",
      Authorization: authorization,
      "Content-Type": "application/json",
      "x-data-logging-enabled": "false",
      "x-folder-id": config.folderId,
    },
    normalize: normalizeYandexOcrResponse,
    url: providerUrl(
      config.apiUrl ?? "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",
      { allowedHost: "ocr.api.cloud.yandex.net" },
    ),
  };
}

function createProviderRequest(provider, config, request) {
  switch (provider) {
    case "paddleocr":
      return paddleRequest(config, request);
    case "local-ocr-llm":
      return localOcrLlmRequest(config, request);
    case "yandex-ai-studio":
      return yandexRequest(config, request);
    default:
      throw new TypeError("Unsupported recognition provider.");
  }
}

export function createFormulaRecognitionGatewayService(options) {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("Fetch is required by the formula recognition gateway.");
  }
  const providers = options.providers ?? {};
  const maximumConcurrentRequests = positiveInteger(
    options.maximumConcurrentRequests ?? 4,
    "Maximum concurrent formula recognition requests",
    64,
  );
  const rateLimitPerWindow = positiveInteger(
    options.rateLimitPerWindow ?? 30,
    "Formula recognition rate limit",
    10_000,
  );
  const rateLimitWindowMs = positiveInteger(
    options.rateLimitWindowMs ?? 60_000,
    "Formula recognition rate window",
    60 * 60 * 1_000,
  );
  const providerAttemptTimeoutMs = positiveInteger(
    options.providerAttemptTimeoutMs ?? 15_000,
    "Formula recognition provider attempt timeout",
    60_000,
  );
  const retryDelayMs = positiveInteger(
    options.retryDelayMs ?? 150,
    "Formula recognition retry delay",
    2_000,
  );
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const logger =
    options.logger ?? ((entry) => console.log(JSON.stringify(entry)));
  const checkRate = createRateGuard(rateLimitPerWindow, rateLimitWindowMs, now);
  let activeRequests = 0;

  async function callProvider(request, requestId, signal) {
    const config = providers[request.provider];
    if (!configuredProvider(config)) {
      return problem(
        "formula-recognition.provider-unconfigured",
        503,
        "Provider unconfigured",
        "The selected formula recognition provider is not configured.",
        false,
        requestId,
      );
    }
    const providerRequest = createProviderRequest(
      request.provider,
      config,
      request,
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptSignal = createAttemptSignal(
        signal,
        providerAttemptTimeoutMs,
      );
      let response;
      let responseBody;
      let operationError;
      let retryDelay = null;
      try {
        response = await fetchImplementation(providerRequest.url, {
          body: providerRequest.body,
          headers: providerRequest.headers,
          method: "POST",
          signal: attemptSignal.signal,
        });
        if (transientProviderStatuses.has(response.status) && attempt === 0) {
          retryDelay = retryAfterMs(response, retryDelayMs);
          await response.body?.cancel().catch(() => undefined);
        } else {
          responseBody = await readBoundedResponse(
            response,
            mathInkProxyLimits.maximumResponseBytes,
          );
        }
      } catch (error) {
        operationError = error;
      } finally {
        attemptSignal.cleanup();
      }

      if (signal.aborted) {
        throw (
          operationError ?? signal.reason ?? new Error("Operation aborted.")
        );
      }
      if (retryDelay !== null) {
        await sleep(retryDelay, signal);
        continue;
      }
      if (operationError !== undefined) {
        if (attempt === 0) {
          await sleep(retryDelayMs, signal);
          continue;
        }
        return attemptSignal.timedOut()
          ? problem(
              "formula-recognition.provider-timeout",
              504,
              "Provider timeout",
              "The selected provider did not respond before the deadline.",
              true,
              requestId,
            )
          : problem(
              "formula-recognition.provider-unavailable",
              503,
              "Provider unavailable",
              "The selected provider could not be reached.",
              true,
              requestId,
            );
      }
      if (response === undefined || responseBody === undefined) {
        return problem(
          "formula-recognition.provider-invalid-response",
          502,
          "Invalid provider response",
          "The selected provider returned an incomplete response.",
          false,
          requestId,
        );
      }
      if (responseBody.status !== "ok") {
        return problem(
          "formula-recognition.provider-invalid-response",
          502,
          "Invalid provider response",
          "The selected provider returned an invalid or oversized response.",
          false,
          requestId,
        );
      }
      if (response.status === 401 || response.status === 403) {
        return problem(
          "formula-recognition.provider-authentication",
          502,
          "Provider authentication failed",
          "The selected provider rejected the configured credentials.",
          false,
          requestId,
        );
      }
      if (response.status === 429) {
        return problem(
          "formula-recognition.provider-rate-limited",
          503,
          "Provider rate limited",
          "The selected provider quota is temporarily unavailable.",
          true,
          requestId,
        );
      }
      if (response.status < 200 || response.status >= 300) {
        return problem(
          transientProviderStatuses.has(response.status)
            ? "formula-recognition.provider-unavailable"
            : "formula-recognition.provider-invalid-response",
          transientProviderStatuses.has(response.status) ? 503 : 502,
          "Provider request failed",
          "The selected provider rejected or could not process the image.",
          transientProviderStatuses.has(response.status),
          requestId,
        );
      }
      if (responseContentType(response) !== "application/json") {
        return problem(
          "formula-recognition.provider-invalid-response",
          502,
          "Invalid provider response",
          "The selected provider returned an unexpected content type.",
          false,
          requestId,
        );
      }
      const parsed = parseJson(responseBody.text);
      if (!parsed.parsed) {
        return problem(
          "formula-recognition.provider-invalid-response",
          502,
          "Invalid provider response",
          "The selected provider returned invalid JSON.",
          false,
          requestId,
        );
      }
      const normalized = providerRequest.normalize(parsed.value, requestId);
      return normalized.valid
        ? { body: normalized.value, status: 200 }
        : problem(
            normalized.code,
            502,
            "Invalid provider response",
            "The selected provider returned data outside the TutorBoard contract.",
            false,
            requestId,
          );
    }
    return problem(
      "formula-recognition.provider-unavailable",
      503,
      "Provider unavailable",
      "The selected provider could not process the request.",
      true,
      requestId,
    );
  }

  return {
    configuredProviders: Object.freeze({
      "local-ocr-llm": configuredProvider(providers["local-ocr-llm"]),
      paddleocr: configuredProvider(providers.paddleocr),
      "yandex-ai-studio": configuredProvider(providers["yandex-ai-studio"]),
    }),
    async recognize({ clientKey, request, requestId, signal }) {
      const startedAt = now();
      const rate = checkRate(clientKey);
      if (!rate.allowed) {
        safeLog(logger, {
          durationMs: 0,
          event: "formula-recognition.recognize",
          outcome: "rate-limited",
          requestId,
        });
        return {
          ...problem(
            "formula-recognition.rate-limited",
            429,
            "Rate limit exceeded",
            "The client has sent too many recognition requests.",
            true,
            requestId,
          ),
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        };
      }
      if (activeRequests >= maximumConcurrentRequests) {
        safeLog(logger, {
          durationMs: 0,
          event: "formula-recognition.recognize",
          outcome: "busy",
          requestId,
        });
        return problem(
          "formula-recognition.gateway-busy",
          503,
          "Gateway busy",
          "The recognition gateway is at its concurrency limit.",
          true,
          requestId,
        );
      }
      const validation = validateFormulaRecognitionRequest(request);
      if (!validation.valid) {
        safeLog(logger, {
          durationMs: now() - startedAt,
          event: "formula-recognition.recognize",
          issueCount: validation.issues.length,
          outcome: "invalid-request",
          requestId,
        });
        return problem(
          "formula-recognition.invalid-request",
          400,
          "Invalid request",
          "The TutorBoard formula recognition request failed validation.",
          false,
          requestId,
        );
      }

      activeRequests += 1;
      try {
        const result = await callProvider(validation.value, requestId, signal);
        safeLog(logger, {
          durationMs: now() - startedAt,
          event: "formula-recognition.recognize",
          outcome: result.status === 200 ? "success" : "provider-failure",
          provider: validation.value.provider,
          requestId,
          status: result.status,
        });
        return result;
      } finally {
        activeRequests -= 1;
      }
    },
  };
}
