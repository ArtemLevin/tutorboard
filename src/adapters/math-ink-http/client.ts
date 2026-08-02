import {
  mathInkRecognitionResultSchemaVersion,
  type MathInkRecognitionCandidate,
  type MathInkRecognitionDiagnostic,
  type MathInkRecognitionRequest,
  type MathInkRecognitionResult,
  type MathInkRecognizer,
} from "../../modules/handwritten-function/public";
import {
  mathInkProblemSchema,
  mathInkProxyResultSchema,
  type MathInkProblemDto,
} from "./validation";

const defaultTimeoutMs = 15_000;
const defaultMaximumResponseBytes = 256 * 1024;
const maximumRequestBytes = 256 * 1024;
const requestIdHeader = "X-TutorBoard-Request-Id";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface MathInkHttpRecognizerOptions {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  readonly maximumResponseBytes?: number;
  readonly origin?: string;
  readonly timeoutMs?: number;
}

interface ResolvedOptions {
  readonly endpoint: URL;
  readonly fetch: FetchLike;
  readonly maximumResponseBytes: number;
  readonly timeoutMs: number;
}

export class MathInkHttpError extends Error {
  public readonly code: string;
  public readonly httpStatus: number | null;
  public readonly retryable: boolean;

  public constructor(
    code: string,
    message: string,
    retryable: boolean,
    httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "MathInkHttpError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

function positiveInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(
      `${label} must be a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

function runtimeOrigin(configuredOrigin: string | undefined): string {
  if (configuredOrigin !== undefined) return configuredOrigin;
  return typeof window === "undefined"
    ? "http://localhost"
    : window.location.origin;
}

function resolveEndpoint(baseUrl: string, origin: string): URL {
  const originUrl = new URL(origin);
  if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") {
    throw new TypeError("Math ink origin must use HTTP or HTTPS.");
  }
  const url = new URL(baseUrl, originUrl);
  if (
    url.origin !== originUrl.origin ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError(
      "Math ink API base URL must be a same-origin path without credentials.",
    );
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return new URL("recognize", url);
}

function resolveOptions(options: MathInkHttpRecognizerOptions): ResolvedOptions {
  const configuredFetch = options.fetch;
  if (configuredFetch === undefined && typeof globalThis.fetch !== "function") {
    throw new Error("Fetch is required by the math ink HTTP adapter.");
  }
  return {
    endpoint: resolveEndpoint(options.baseUrl, runtimeOrigin(options.origin)),
    fetch:
      configuredFetch === undefined
        ? (input, init) => globalThis.fetch(input, init)
        : (input, init) => configuredFetch(input, init),
    maximumResponseBytes: positiveInteger(
      options.maximumResponseBytes ?? defaultMaximumResponseBytes,
      "Math ink response limit",
      2 * 1024 * 1024,
    ),
    timeoutMs: positiveInteger(
      options.timeoutMs ?? defaultTimeoutMs,
      "Math ink request timeout",
      60_000,
    ),
  };
}

async function readBoundedText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declared = response.headers.get("Content-Length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (Number.isFinite(parsed) && parsed > maximumBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new MathInkHttpError(
        "math-ink.response-too-large",
        "Сервис распознавания вернул слишком большой ответ.",
        false,
        response.status,
      );
    }
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new MathInkHttpError(
          "math-ink.response-too-large",
          "Сервис распознавания вернул слишком большой ответ.",
          false,
          response.status,
        );
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
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new MathInkHttpError(
      "math-ink.invalid-utf8",
      "Сервис распознавания вернул некорректный текстовый ответ.",
      false,
      response.status,
    );
  }
}

function parseJson(text: string, status: number): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MathInkHttpError(
      "math-ink.invalid-json",
      "Сервис распознавания вернул некорректный JSON.",
      false,
      status,
    );
  }
}

function contentType(response: Response): string {
  return response.headers.get("Content-Type")?.split(";", 1)[0]?.trim() ?? "";
}

function problemMessage(problem: MathInkProblemDto): string {
  const messages: Record<string, string> = {
    "math-ink.invalid-request": "Рукописный ввод не прошёл проверку сервиса.",
    "math-ink.provider-authentication":
      "Сервис распознавания требует проверки конфигурации.",
    "math-ink.provider-invalid-response":
      "Провайдер вернул несовместимый результат распознавания.",
    "math-ink.provider-rate-limited":
      "Лимит провайдера временно исчерпан. Повторите распознавание позже.",
    "math-ink.provider-timeout":
      "Провайдер не успел обработать рукописную функцию.",
    "math-ink.provider-unavailable":
      "Провайдер распознавания временно недоступен.",
    "math-ink.proxy-busy":
      "Сервис распознавания занят. Повторите попытку позже.",
    "math-ink.proxy-unconfigured":
      "Автоматическое распознавание пока не настроено.",
    "math-ink.rate-limited":
      "Слишком много запросов распознавания. Повторите попытку позже.",
    "math-ink.request-too-large": "Рукописная функция содержит слишком много данных.",
  };
  return messages[problem.code] ?? problem.detail;
}

function candidateFromDto(
  candidate: {
    readonly confidence?: number | undefined;
    readonly expression: string;
    readonly format: "jiix" | "latex" | "plot-expression";
  },
): MathInkRecognitionCandidate {
  return candidate.confidence === undefined
    ? { expression: candidate.expression, format: candidate.format }
    : {
        confidence: candidate.confidence,
        expression: candidate.expression,
        format: candidate.format,
      };
}

function diagnosticFromDto(diagnostic: {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "info" | "warning";
}): MathInkRecognitionDiagnostic {
  return { ...diagnostic };
}

async function executeRecognition(
  options: ResolvedOptions,
  request: MathInkRecognitionRequest,
  callerSignal: AbortSignal,
): Promise<MathInkRecognitionResult> {
  const body = JSON.stringify(request);
  if (new TextEncoder().encode(body).byteLength > maximumRequestBytes) {
    throw new MathInkHttpError(
      "math-ink.request-too-large",
      "Рукописная функция содержит слишком много данных.",
      false,
    );
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(callerSignal.reason);
  if (callerSignal.aborted) abortFromCaller();
  else callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  let response: Response;
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
  } catch (error) {
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
  }

  const text = await readBoundedText(response, options.maximumResponseBytes);
  const mediaType = contentType(response);
  if (response.status !== 200) {
    if (mediaType !== "application/problem+json") {
      throw new MathInkHttpError(
        "math-ink.wrong-content-type",
        "Сервис распознавания вернул несовместимую ошибку.",
        response.status >= 500,
        response.status,
      );
    }
    const parsed = mathInkProblemSchema.safeParse(parseJson(text, response.status));
    if (!parsed.success || parsed.data.status !== response.status) {
      throw new MathInkHttpError(
        "math-ink.problem-schema-mismatch",
        "Сервис распознавания вернул несовместимую ошибку.",
        response.status >= 500,
        response.status,
      );
    }
    throw new MathInkHttpError(
      parsed.data.code,
      problemMessage(parsed.data),
      parsed.data.retryable,
      response.status,
    );
  }
  if (mediaType !== "application/json") {
    throw new MathInkHttpError(
      "math-ink.wrong-content-type",
      "Сервис распознавания вернул несовместимый ответ.",
      false,
      response.status,
    );
  }
  const parsed = mathInkProxyResultSchema.safeParse(parseJson(text, 200));
  if (!parsed.success || parsed.data.requestId !== request.recognitionId) {
    throw new MathInkHttpError(
      "math-ink.response-schema-mismatch",
      "Сервис распознавания вернул несовместимый результат.",
      false,
      200,
    );
  }
  return {
    candidates: parsed.data.candidates.map(candidateFromDto),
    diagnostics: parsed.data.diagnostics.map(diagnosticFromDto),
    recognizerId: "mathpix.strokes.via-tutorboard-proxy",
    recognizerVersion: `1.0:${parsed.data.providerVersion}`,
    schemaVersion: mathInkRecognitionResultSchemaVersion,
    status: parsed.data.status,
  };
}

export function createMathInkHttpRecognizer(
  options: MathInkHttpRecognizerOptions,
): MathInkRecognizer {
  const resolved = resolveOptions(options);
  return {
    id: "mathpix.strokes.via-tutorboard-proxy",
    version: "1.0",
    recognize: (request, signal) =>
      executeRecognition(resolved, request, signal),
  };
}

export { requestIdHeader as mathInkRequestIdHeader };
