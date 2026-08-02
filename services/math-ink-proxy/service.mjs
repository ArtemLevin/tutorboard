import {
  createMathpixStrokeRequest,
  mathInkProxyLimits,
  normalizeMathpixResponse,
  validateMathInkRequest,
} from "./contract.mjs";

const transientProviderStatuses = new Set([429, 502, 503, 504]);
const problemTypeBase = "https://tutorboard.local/problems/";

function positiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(
      `${label} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

function providerUrl(value, allowInsecureUpstream) {
  const url = new URL(value);
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new TypeError("Mathpix API URL cannot contain credentials, query or fragment data.");
  }
  if (allowInsecureUpstream) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Mathpix API URL must use HTTP or HTTPS.");
    }
  } else if (url.protocol !== "https:" || url.hostname !== "api.mathpix.com") {
    throw new TypeError("Mathpix API URL must use https://api.mathpix.com in production.");
  }
  return url;
}

function defaultSleep(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("Operation aborted."));
      return;
    }
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Operation aborted."));
      },
      { once: true },
    );
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
    // Logging cannot affect request processing.
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
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - timestamp) / 1_000)),
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

export function createMathInkProxyService(options) {
  if (typeof options.appId !== "string" || options.appId.length === 0) {
    throw new TypeError("Mathpix app ID is required.");
  }
  if (typeof options.appKey !== "string" || options.appKey.length === 0) {
    throw new TypeError("Mathpix app key is required.");
  }
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new TypeError("Fetch is required by the math ink proxy.");
  }
  const apiUrl = providerUrl(
    options.apiUrl ?? "https://api.mathpix.com/v3/strokes",
    options.allowInsecureUpstream === true,
  );
  const maximumConcurrentRequests = positiveInteger(
    options.maximumConcurrentRequests ?? 4,
    "Maximum concurrent math ink requests",
    64,
  );
  const rateLimitPerWindow = positiveInteger(
    options.rateLimitPerWindow ?? 30,
    "Math ink rate limit",
    10_000,
  );
  const rateLimitWindowMs = positiveInteger(
    options.rateLimitWindowMs ?? 60_000,
    "Math ink rate window",
    60 * 60 * 1_000,
  );
  const providerAttemptTimeoutMs = positiveInteger(
    options.providerAttemptTimeoutMs ?? 10_000,
    "Mathpix attempt timeout",
    60_000,
  );
  const retryDelayMs = positiveInteger(
    options.retryDelayMs ?? 150,
    "Mathpix retry delay",
    2_000,
  );
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const logger = options.logger ?? ((entry) => console.log(JSON.stringify(entry)));
  const checkRate = createRateGuard(rateLimitPerWindow, rateLimitWindowMs, now);
  let activeRequests = 0;

  async function callProvider(request, requestId, signal) {
    const body = JSON.stringify(createMathpixStrokeRequest(request));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptSignal = createAttemptSignal(signal, providerAttemptTimeoutMs);
      let response;
      try {
        response = await fetchImplementation(apiUrl, {
          body,
          headers: {
            "Content-Type": "application/json",
            app_id: options.appId,
            app_key: options.appKey,
          },
          method: "POST",
          signal: attemptSignal.signal,
        });
      } catch (error) {
        const timedOut = attemptSignal.timedOut();
        attemptSignal.cleanup();
        if (signal.aborted) throw error;
        if (attempt === 0) {
          await sleep(retryDelayMs, signal);
          continue;
        }
        return timedOut
          ? problem(
              "math-ink.provider-timeout",
              504,
              "Provider timeout",
              "Mathpix did not respond before the attempt deadline.",
              true,
              requestId,
            )
          : problem(
              "math-ink.provider-unavailable",
              503,
              "Provider unavailable",
              "Mathpix could not be reached.",
              true,
              requestId,
            );
      }
      attemptSignal.cleanup();

      if (transientProviderStatuses.has(response.status) && attempt === 0) {
        await response.body?.cancel().catch(() => undefined);
        await sleep(retryAfterMs(response, retryDelayMs), signal);
        continue;
      }

      const responseBody = await readBoundedResponse(
        response,
        mathInkProxyLimits.maximumResponseBytes,
      );
      if (responseBody.status !== "ok") {
        return problem(
          "math-ink.provider-invalid-response",
          502,
          "Invalid provider response",
          "Mathpix returned an invalid or oversized response.",
          false,
          requestId,
        );
      }

      if (response.status === 401 || response.status === 403) {
        return problem(
          "math-ink.provider-authentication",
          502,
          "Provider authentication failed",
          "Mathpix rejected the configured credentials.",
          false,
          requestId,
        );
      }
      if (response.status === 429) {
        return problem(
          "math-ink.provider-rate-limited",
          503,
          "Provider rate limited",
          "Mathpix quota is temporarily unavailable.",
          true,
          requestId,
        );
      }
      if (response.status < 200 || response.status >= 300) {
        return problem(
          transientProviderStatuses.has(response.status)
            ? "math-ink.provider-unavailable"
            : "math-ink.provider-invalid-response",
          transientProviderStatuses.has(response.status) ? 503 : 502,
          "Provider request failed",
          "Mathpix rejected or could not process the stroke request.",
          transientProviderStatuses.has(response.status),
          requestId,
        );
      }
      if (responseContentType(response) !== "application/json") {
        return problem(
          "math-ink.provider-invalid-response",
          502,
          "Invalid provider response",
          "Mathpix returned an unexpected content type.",
          false,
          requestId,
        );
      }
      const parsed = parseJson(responseBody.text);
      if (!parsed.parsed) {
        return problem(
          "math-ink.provider-invalid-response",
          502,
          "Invalid provider response",
          "Mathpix returned invalid JSON.",
          false,
          requestId,
        );
      }
      const normalized = normalizeMathpixResponse(parsed.value, requestId);
      return normalized.valid
        ? { body: normalized.value, status: 200 }
        : problem(
            normalized.code,
            502,
            "Invalid provider response",
            "Mathpix returned a response outside the TutorBoard contract.",
            false,
            requestId,
          );
    }
    return problem(
      "math-ink.provider-unavailable",
      503,
      "Provider unavailable",
      "Mathpix could not process the request.",
      true,
      requestId,
    );
  }

  return {
    async recognize({ clientKey, request, requestId, signal }) {
      const startedAt = now();
      const rate = checkRate(clientKey);
      if (!rate.allowed) {
        safeLog(logger, {
          durationMs: 0,
          event: "math-ink.recognize",
          outcome: "rate-limited",
          requestId,
        });
        return {
          ...problem(
            "math-ink.rate-limited",
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
          event: "math-ink.recognize",
          outcome: "busy",
          requestId,
        });
        return problem(
          "math-ink.proxy-busy",
          503,
          "Proxy busy",
          "The recognition proxy is at its concurrency limit.",
          true,
          requestId,
        );
      }
      const validation = validateMathInkRequest(request);
      if (!validation.valid) {
        safeLog(logger, {
          durationMs: now() - startedAt,
          event: "math-ink.recognize",
          issueCount: validation.issues.length,
          outcome: "invalid-request",
          requestId,
        });
        return problem(
          "math-ink.invalid-request",
          400,
          "Invalid request",
          "The TutorBoard math ink request failed validation.",
          false,
          requestId,
        );
      }

      activeRequests += 1;
      try {
        const result = await callProvider(validation.value, requestId, signal);
        safeLog(logger, {
          durationMs: now() - startedAt,
          event: "math-ink.recognize",
          outcome: result.status === 200 ? "success" : "provider-failure",
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

export function createUnconfiguredMathInkProxyService() {
  return {
    async recognize({ requestId }) {
      return problem(
        "math-ink.proxy-unconfigured",
        503,
        "Proxy unconfigured",
        "Mathpix credentials are not configured.",
        false,
        requestId,
      );
    },
  };
}
