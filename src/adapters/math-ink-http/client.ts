import {
  mathInkRecognitionResultSchemaVersion,
  type MathInkRecognitionCandidate,
  type MathInkRecognitionDiagnostic,
  type MathInkRecognitionProvider,
  type MathInkRecognitionRequest,
  type MathInkRecognitionResult,
  type MathInkRecognizer,
} from "../../modules/handwritten-function/public";
import {
  rasterizeMathInkRequest,
  type MathInkRasterizer,
} from "./rasterization";
import {
  formulaRecognitionResultSchemaVersion,
  mathInkProblemSchema,
  mathInkProxyResultSchema,
  type MathInkProblemDto,
} from "./validation";

const formulaRecognitionRequestSchemaVersion =
  "tutorboard.formula-recognition-request/1" as const;
const defaultTimeoutMs = 20_000;
const defaultMaximumResponseBytes = 256 * 1024;
const maximumRequestBytes = 1024 * 1024;
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
  readonly provider: MathInkRecognitionProvider;
  readonly rasterize?: MathInkRasterizer;
  readonly timeoutMs?: number;
}

interface ResolvedOptions {
  readonly endpoint: URL;
  readonly fetch: FetchLike;
  readonly maximumResponseBytes: number;
  readonly provider: MathInkRecognitionProvider;
  readonly rasterize: MathInkRasterizer;
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

function positiveInteger(
  value: number,
  label: string,
  maximum: number,
): number {
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
    throw new TypeError("Formula recognition origin must use HTTP or HTTPS.");
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
      "Formula recognition API base URL must be a same-origin path without credentials.",
    );
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return new URL("recognize", url);
}

function resolveOptions(
  options: MathInkHttpRecognizerOptions,
): ResolvedOptions {
  const configuredFetch = options.fetch;
  if (configuredFetch === undefined && typeof globalThis.fetch !== "function") {
    throw new Error("Fetch is required by the formula recognition adapter.");
  }
  return {
    endpoint: resolveEndpoint(options.baseUrl, runtimeOrigin(options.origin)),
    fetch:
      configuredFetch === undefined
        ? (input, init) => globalThis.fetch(input, init)
        : (input, init) => configuredFetch(input, init),
    maximumResponseBytes: positiveInteger(
      options.maximumResponseBytes ?? defaultMaximumResponseBytes,
      "Formula recognition response limit",
      2 * 1024 * 1024,
    ),
    provider: options.provider,
    rasterize: options.rasterize ?? rasterizeMathInkRequest,
    timeoutMs: positiveInteger(
      options.timeoutMs ?? defaultTimeoutMs,
      "Formula recognition request timeout",
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
        "formula-recognition.response-too-large",
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
          "formula-recognition.response-too-large",
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
      "formula-recognition.invalid-utf8",
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
      "formula-recognition.invalid-json",
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
    "formula-recognition.invalid-request":
      "Рукописный ввод не прошёл проверку сервиса.",
    "formula-recognition.provider-authentication":
      "Выбранный провайдер требует проверки серверной конфигурации.",
    "formula-recognition.provider-invalid-response":
      "Провайдер вернул несовместимый результат распознавания.",
    "formula-recognition.provider-rate-limited":
      "Лимит выбранного провайдера временно исчерпан.",
    "formula-recognition.provider-timeout":
      "Провайдер не успел обработать рукописную формулу.",
    "formula-recognition.provider-unavailable":
      "Выбранный провайдер распознавания временно недоступен.",
    "formula-recognition.provider-unconfigured":
      "Выбранный способ распознавания пока не настроен на сервере.",
    "formula-recognition.gateway-busy":
      "Сервис распознавания занят. Повторите попытку позже.",
    "formula-recognition.rate-limited":
      "Слишком много запросов распознавания. Повторите попытку позже.",
    "formula-recognition.request-too-large":
      "Изображение рукописной формулы получилось слишком большим.",
  };
  return messages[problem.code] ?? problem.detail;
}

function candidateFromDto(candidate: {
  readonly confidence?: number | undefined;
  readonly expression: string;
  readonly format: "jiix" | "latex" | "plot-expression";
}): MathInkRecognitionCandidate {
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

function totalPointCount(request: MathInkRecognitionRequest): number {
  return request.strokes.reduce(
    (count, stroke) => count + stroke.points.length,
    0,
  );
}

async function createRequestBody(
  options: ResolvedOptions,
  request: MathInkRecognitionRequest,
): Promise<string> {
  let image;
  try {
    image = await options.rasterize(request);
  } catch (error) {
    throw new MathInkHttpError(
      "formula-recognition.rasterization-failed",
      error instanceof Error
        ? `Не удалось подготовить изображение формулы: ${error.message}`
        : "Не удалось подготовить изображение формулы.",
      false,
    );
  }
  const body = JSON.stringify({
    image,
    provider: options.provider,
    recognitionId: request.recognitionId,
    schemaVersion: formulaRecognitionRequestSchemaVersion,
    sessionId: request.sessionId,
    source: {
      normalizedHeight: request.normalizedHeight,
      normalizedWidth: request.normalizedWidth,
      pointCount: totalPointCount(request),
      strokeCount: request.strokes.length,
    },
  });
  if (new TextEncoder().encode(body).byteLength > maximumRequestBytes) {
    throw new MathInkHttpError(
      "formula-recognition.request-too-large",
      "Изображение рукописной формулы получилось слишком большим.",
      false,
    );
  }
  return body;
}

async function executeRecognition(
  options: ResolvedOptions,
  request: MathInkRecognitionRequest,
  callerSignal: AbortSignal,
): Promise<MathInkRecognitionResult> {
  const body = await createRequestBody(options, request);
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
        "formula-recognition.timeout",
        "Сервис распознавания не ответил вовремя.",
        true,
      );
    }
    throw new MathInkHttpError(
      "formula-recognition.network-failure",
      "Не удалось подключиться к сервису распознавания.",
      true,
    );
  } finally {
    globalThis.clearTimeout(timer);
    callerSignal.removeEventListener("abort", abortFromCaller);
  }

  const mediaType = contentType(response);
  if (response.status !== 200) {
    if (mediaType !== "application/problem+json") {
      throw new MathInkHttpError(
        "formula-recognition.wrong-content-type",
        "Сервис распознавания вернул несовместимую ошибку.",
        response.status >= 500,
        response.status,
      );
    }
    const parsed = mathInkProblemSchema.safeParse(
      parseJson(text, response.status),
    );
    if (!parsed.success || parsed.data.status !== response.status) {
      throw new MathInkHttpError(
        "formula-recognition.problem-schema-mismatch",
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
      "formula-recognition.wrong-content-type",
      "Сервис распознавания вернул несовместимый ответ.",
      false,
      response.status,
    );
  }
  const parsed = mathInkProxyResultSchema.safeParse(parseJson(text, 200));
  if (
    !parsed.success ||
    parsed.data.requestId !== request.recognitionId ||
    parsed.data.provider !== options.provider ||
    parsed.data.schemaVersion !== formulaRecognitionResultSchemaVersion
  ) {
    throw new MathInkHttpError(
      "formula-recognition.response-schema-mismatch",
      "Сервис распознавания вернул несовместимый результат.",
      false,
      200,
    );
  }
  return {
    candidates: parsed.data.candidates.map(candidateFromDto),
    diagnostics: parsed.data.diagnostics.map(diagnosticFromDto),
    recognizerId: `${parsed.data.provider}.via-tutorboard-gateway`,
    recognizerVersion: `2.0:${parsed.data.providerVersion}`,
    schemaVersion: mathInkRecognitionResultSchemaVersion,
    status: parsed.data.status,
  };
}

export function createMathInkHttpRecognizer(
  options: MathInkHttpRecognizerOptions,
): MathInkRecognizer {
  const resolved = resolveOptions(options);
  return {
    id: `${resolved.provider}.via-tutorboard-gateway`,
    version: "2.0",
    recognize: (request, signal) =>
      executeRecognition(resolved, request, signal),
  };
}

export { requestIdHeader as mathInkRequestIdHeader };
