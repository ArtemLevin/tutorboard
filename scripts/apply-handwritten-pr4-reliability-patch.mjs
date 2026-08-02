import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function replaceBlock(relativePath, startMarker, endMarker, replacement) {
  const filePath = path.join(root, relativePath);
  let source = fs.readFileSync(filePath, "utf8");
  if (source.includes(replacement)) return;
  const start = source.indexOf(startMarker);
  const endStart = source.indexOf(endMarker, start);
  if (start < 0 || endStart < 0) {
    throw new Error(`${relativePath}: reliability patch markers are missing`);
  }
  source =
    source.slice(0, start) +
    replacement +
    source.slice(endStart + endMarker.length);
  fs.writeFileSync(filePath, source);
}

replaceBlock(
  "services/math-ink-proxy/service.mjs",
  "function defaultSleep(delayMs, signal) {",
  "\n}\n\nasync function readBoundedResponse",
  `function defaultSleep(delayMs, signal) {
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

async function readBoundedResponse`,
);

replaceBlock(
  "services/math-ink-proxy/service.mjs",
  "  async function callProvider(request, requestId, signal) {",
  "\n  }\n\n  return {",
  `  async function callProvider(request, requestId, signal) {
    const body = JSON.stringify(createMathpixStrokeRequest(request));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptSignal = createAttemptSignal(
        signal,
        providerAttemptTimeoutMs,
      );
      let response;
      let responseBody;
      let operationError;
      const retryDelay = { value: null };
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
        if (transientProviderStatuses.has(response.status) && attempt === 0) {
          retryDelay.value = retryAfterMs(response, retryDelayMs);
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
        throw operationError ?? signal.reason ?? new Error("Operation aborted.");
      }
      if (retryDelay.value !== null) {
        await sleep(retryDelay.value, signal);
        continue;
      }
      if (operationError !== undefined) {
        if (attempt === 0) {
          await sleep(retryDelayMs, signal);
          continue;
        }
        return attemptSignal.timedOut()
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
      if (response === undefined || responseBody === undefined) {
        return problem(
          "math-ink.provider-invalid-response",
          502,
          "Invalid provider response",
          "Mathpix returned an incomplete response.",
          false,
          requestId,
        );
      }
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

  return {`,
);

replaceBlock(
  "src/adapters/math-ink-http/client.ts",
  "  let response: Response;",
  "\n  const text = await readBoundedText(response, options.maximumResponseBytes);",
  `  let response: Response;
  let text: string;
  try {
    response = await options.fetch(options.endpoint, {
      body,
      headers: {
        Accept: "application/json, application/problem+json",
        "Content-Type": "application/json",
        [requestIdHeader]: request.recognitionId,
      },
      method: "POST",
      signal: controller.signal,
    });
    text = await readBoundedText(response, options.maximumResponseBytes);
  } catch (error) {
    if (error instanceof MathInkHttpError) throw error;
    if (callerSignal.aborted) throw error;
    if (timedOut) {
      throw new MathInkHttpError(
        "math-ink.timeout",
        "Сервис распознавания не ответил вовремя.",
        true,
      );
    }
    throw new MathInkHttpError(
      "math-ink.network-failure",
      "Не удалось подключиться к сервису распознавания.",
      true,
    );
  } finally {
    globalThis.clearTimeout(timer);
    callerSignal.removeEventListener("abort", abortFromCaller);
  }`,
);

const serverPath = path.join(root, "services/math-ink-proxy/server.mjs");
let server = fs.readFileSync(serverPath, "utf8");
if (!server.includes('import { fileURLToPath } from "node:url";')) {
  server = server.replace(
    'import process from "node:process";\n',
    'import process from "node:process";\nimport { fileURLToPath } from "node:url";\n',
  );
}
server = server.replace(
  'if (process.argv[1] === new URL(import.meta.url).pathname) {',
  'if (process.argv[1] === fileURLToPath(import.meta.url)) {',
);
fs.writeFileSync(serverPath, server);
