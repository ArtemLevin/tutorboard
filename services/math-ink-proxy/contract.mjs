export const formulaRecognitionRequestSchemaVersion =
  "tutorboard.formula-recognition-request/1";
export const formulaRecognitionResultSchemaVersion =
  "tutorboard.formula-recognition-result/1";
export const mathInkProxyServiceVersion = "2.0.0";
export const formulaRecognitionProviders = Object.freeze([
  "paddleocr",
  "local-ocr-llm",
  "yandex-ai-studio",
]);

export const mathInkProxyLimits = Object.freeze({
  maximumBodyBytes: 1024 * 1024,
  maximumCandidateCount: 8,
  maximumDecodedImageBytes: 768 * 1024,
  maximumDiagnosticCount: 16,
  maximumImageSide: 768,
  maximumResponseBytes: 512 * 1024,
  maximumSourcePointCount: 16_384,
  maximumSourceStrokeCount: 128,
});

const providerSet = new Set(formulaRecognitionProviders);
const identifierPattern = /^[A-Za-z0-9:._-]+$/u;
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/u;
const requestKeys = new Set([
  "image",
  "provider",
  "recognitionId",
  "schemaVersion",
  "sessionId",
  "source",
]);
const imageKeys = new Set(["data", "height", "mimeType", "width"]);
const sourceKeys = new Set([
  "normalizedHeight",
  "normalizedWidth",
  "pointCount",
  "strokeCount",
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    identifierPattern.test(value)
  );
}

function issue(path, message) {
  return { message, path };
}

function decodedBase64ByteLength(value) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) {
    return null;
  }
  if (!base64Pattern.test(value)) return null;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

export function validateFormulaRecognitionRequest(value) {
  const issues = [];
  if (!isRecord(value) || !hasOnlyKeys(value, requestKeys)) {
    return {
      issues: [issue("/", "request must be a strict object")],
      valid: false,
    };
  }
  if (value.schemaVersion !== formulaRecognitionRequestSchemaVersion) {
    issues.push(issue("/schemaVersion", "unsupported schema version"));
  }
  if (!providerSet.has(value.provider)) {
    issues.push(issue("/provider", "unsupported recognition provider"));
  }
  if (!validIdentifier(value.recognitionId)) {
    issues.push(issue("/recognitionId", "invalid recognition identifier"));
  }
  if (!validIdentifier(value.sessionId)) {
    issues.push(issue("/sessionId", "invalid session identifier"));
  }

  if (!isRecord(value.image) || !hasOnlyKeys(value.image, imageKeys)) {
    issues.push(issue("/image", "image must be a strict object"));
  } else {
    if (value.image.mimeType !== "image/png") {
      issues.push(issue("/image/mimeType", "only image/png is supported"));
    }
    for (const dimension of ["width", "height"]) {
      if (
        !Number.isSafeInteger(value.image[dimension]) ||
        value.image[dimension] <= 0 ||
        value.image[dimension] > mathInkProxyLimits.maximumImageSide
      ) {
        issues.push(
          issue(
            `/image/${dimension}`,
            `image ${dimension} must be between 1 and ${mathInkProxyLimits.maximumImageSide}`,
          ),
        );
      }
    }
    const decodedBytes = decodedBase64ByteLength(value.image.data);
    if (
      decodedBytes === null ||
      decodedBytes <= 0 ||
      decodedBytes > mathInkProxyLimits.maximumDecodedImageBytes
    ) {
      issues.push(issue("/image/data", "image base64 is invalid or oversized"));
    }
  }

  if (!isRecord(value.source) || !hasOnlyKeys(value.source, sourceKeys)) {
    issues.push(issue("/source", "source must be a strict object"));
  } else {
    for (const dimension of ["normalizedWidth", "normalizedHeight"]) {
      if (
        !finiteNumber(value.source[dimension]) ||
        value.source[dimension] < 0 ||
        value.source[dimension] > 1
      ) {
        issues.push(issue(`/source/${dimension}`, "value must be in [0, 1]"));
      }
    }
    if (
      !Number.isSafeInteger(value.source.strokeCount) ||
      value.source.strokeCount <= 0 ||
      value.source.strokeCount > mathInkProxyLimits.maximumSourceStrokeCount
    ) {
      issues.push(issue("/source/strokeCount", "stroke count is outside limits"));
    }
    if (
      !Number.isSafeInteger(value.source.pointCount) ||
      value.source.pointCount < value.source.strokeCount * 2 ||
      value.source.pointCount > mathInkProxyLimits.maximumSourcePointCount
    ) {
      issues.push(issue("/source/pointCount", "point count is outside limits"));
    }
  }

  return issues.length === 0
    ? { valid: true, value }
    : { issues, valid: false };
}

export function stripOuterMathDelimiters(value) {
  let result = value.trim();
  if (result.startsWith("```")) {
    result = result.replace(/^```(?:latex|tex|math)?\s*/iu, "");
    result = result.replace(/\s*```$/u, "").trim();
  }
  const pairs = [
    ["\\(", "\\)"],
    ["\\[", "\\]"],
    ["$$", "$$"],
    ["$", "$"],
  ];
  for (const [start, end] of pairs) {
    if (
      result.startsWith(start) &&
      result.endsWith(end) &&
      result.length > start.length + end.length
    ) {
      result = result.slice(start.length, -end.length).trim();
      break;
    }
  }
  return result;
}

function boundedString(value, maximum = 4_096) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
    ? value.trim()
    : null;
}

function normalizedResult(provider, expressionSource, metadata = {}) {
  const providerRequestId = boundedString(metadata.providerRequestId, 256);
  const providerVersion = boundedString(metadata.providerVersion, 128) ?? "unknown";
  const confidence =
    finiteNumber(metadata.confidence) &&
    metadata.confidence >= 0 &&
    metadata.confidence <= 1
      ? metadata.confidence
      : undefined;
  if (expressionSource === null) {
    return {
      valid: true,
      value: {
        candidates: [],
        diagnostics: [
          {
            code: "formula-recognition.provider-unrecognized",
            message: `${provider} did not return a mathematical expression.`,
            severity: "warning",
          },
        ],
        provider,
        providerRequestId,
        providerVersion,
        requestId: metadata.requestId,
        schemaVersion: formulaRecognitionResultSchemaVersion,
        status: "unrecognized",
      },
    };
  }
  const expression = stripOuterMathDelimiters(expressionSource);
  if (expression.length === 0 || expression.length > 4_096) {
    return {
      code: "formula-recognition.provider-invalid-response",
      valid: false,
    };
  }
  const candidate =
    confidence === undefined
      ? { expression, format: "latex" }
      : { confidence, expression, format: "latex" };
  return {
    valid: true,
    value: {
      candidates: [candidate],
      diagnostics: [],
      provider,
      providerRequestId,
      providerVersion,
      requestId: metadata.requestId,
      schemaVersion: formulaRecognitionResultSchemaVersion,
      status: "recognized",
    },
  };
}

export function normalizePaddleOcrResponse(payload, requestId) {
  if (!isRecord(payload)) {
    return { code: "formula-recognition.provider-invalid-response", valid: false };
  }
  const nested = isRecord(payload.result) ? payload.result : null;
  const expression =
    boundedString(payload.latex) ??
    boundedString(payload.formula) ??
    boundedString(nested?.latex) ??
    boundedString(nested?.formula) ??
    boundedString(nested?.text);
  return normalizedResult("paddleocr", expression, {
    confidence: payload.confidence ?? nested?.confidence,
    providerRequestId: payload.requestId ?? payload.request_id,
    providerVersion:
      payload.modelVersion ?? payload.model_version ?? nested?.modelVersion,
    requestId,
  });
}

export function normalizeLocalOcrLlmResponse(payload, requestId) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return { code: "formula-recognition.provider-invalid-response", valid: false };
  }
  const choice = payload.choices[0];
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : null;
  const content = boundedString(message?.content);
  return normalizedResult("local-ocr-llm", content, {
    providerRequestId: payload.id,
    providerVersion: payload.model,
    requestId,
  });
}

function yandexFullText(payload) {
  if (!isRecord(payload)) return null;
  const result = isRecord(payload.result) ? payload.result : null;
  const annotation = isRecord(result?.textAnnotation)
    ? result.textAnnotation
    : isRecord(payload.textAnnotation)
      ? payload.textAnnotation
      : null;
  return (
    boundedString(annotation?.fullText) ??
    boundedString(result?.fullText) ??
    boundedString(payload.fullText)
  );
}

export function normalizeYandexOcrResponse(payload, requestId) {
  if (!isRecord(payload)) {
    return { code: "formula-recognition.provider-invalid-response", valid: false };
  }
  return normalizedResult("yandex-ai-studio", yandexFullText(payload), {
    providerRequestId: payload.requestId ?? payload.request_id,
    providerVersion: payload.modelVersion ?? payload.model_version ?? "math-markdown",
    requestId,
  });
}
