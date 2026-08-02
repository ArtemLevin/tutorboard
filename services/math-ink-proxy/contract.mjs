export const mathInkRequestSchemaVersion =
  "tutorboard.math-ink-request/0.1";
export const mathInkProxyResultSchemaVersion =
  "tutorboard.math-ink-proxy-result/0.1";
export const mathInkProxyServiceVersion = "1.0.0";

export const mathInkProxyLimits = Object.freeze({
  maximumBodyBytes: 256 * 1024,
  maximumCandidateCount: 8,
  maximumDiagnosticCount: 16,
  maximumPointsPerStroke: 4_096,
  maximumResponseBytes: 256 * 1024,
  maximumStrokeCount: 128,
  maximumTotalPointCount: 16_384,
  providerCoordinateScale: 10_000,
});

const identifierPattern = /^[A-Za-z0-9:._-]+$/u;
const requestKeys = new Set([
  "normalization",
  "normalizedHeight",
  "normalizedWidth",
  "recognitionId",
  "schemaVersion",
  "sessionId",
  "sourceBounds",
  "strokes",
]);
const normalizationKeys = new Set(["originX", "originY", "scale"]);
const boundsKeys = new Set([
  "height",
  "maxX",
  "maxY",
  "minX",
  "minY",
  "width",
]);
const strokeKeys = new Set(["id", "points"]);
const pointKeys = new Set(["timeMs", "x", "y"]);

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

function validateBounds(value, path, issues) {
  if (!isRecord(value) || !hasOnlyKeys(value, boundsKeys)) {
    issues.push(issue(path, "bounds must be a strict object"));
    return;
  }
  for (const key of boundsKeys) {
    if (!finiteNumber(value[key])) {
      issues.push(issue(`${path}/${key}`, "value must be finite"));
    }
  }
  if (
    finiteNumber(value.minX) &&
    finiteNumber(value.maxX) &&
    value.maxX < value.minX
  ) {
    issues.push(issue(path, "maxX must be greater than or equal to minX"));
  }
  if (
    finiteNumber(value.minY) &&
    finiteNumber(value.maxY) &&
    value.maxY < value.minY
  ) {
    issues.push(issue(path, "maxY must be greater than or equal to minY"));
  }
  if (finiteNumber(value.width) && value.width < 0) {
    issues.push(issue(`${path}/width`, "width must be non-negative"));
  }
  if (finiteNumber(value.height) && value.height < 0) {
    issues.push(issue(`${path}/height`, "height must be non-negative"));
  }
}

export function validateMathInkRequest(value) {
  const issues = [];
  if (!isRecord(value) || !hasOnlyKeys(value, requestKeys)) {
    return {
      issues: [issue("/", "request must be a strict object")],
      valid: false,
    };
  }
  if (value.schemaVersion !== mathInkRequestSchemaVersion) {
    issues.push(issue("/schemaVersion", "unsupported schema version"));
  }
  if (!validIdentifier(value.recognitionId)) {
    issues.push(issue("/recognitionId", "invalid recognition identifier"));
  }
  if (!validIdentifier(value.sessionId)) {
    issues.push(issue("/sessionId", "invalid session identifier"));
  }
  if (
    !finiteNumber(value.normalizedWidth) ||
    value.normalizedWidth < 0 ||
    value.normalizedWidth > 1
  ) {
    issues.push(issue("/normalizedWidth", "normalized width must be in [0, 1]"));
  }
  if (
    !finiteNumber(value.normalizedHeight) ||
    value.normalizedHeight < 0 ||
    value.normalizedHeight > 1
  ) {
    issues.push(
      issue("/normalizedHeight", "normalized height must be in [0, 1]"),
    );
  }
  if (
    !isRecord(value.normalization) ||
    !hasOnlyKeys(value.normalization, normalizationKeys)
  ) {
    issues.push(issue("/normalization", "normalization must be a strict object"));
  } else {
    for (const key of normalizationKeys) {
      if (!finiteNumber(value.normalization[key])) {
        issues.push(issue(`/normalization/${key}`, "value must be finite"));
      }
    }
    if (
      finiteNumber(value.normalization.scale) &&
      value.normalization.scale <= 0
    ) {
      issues.push(issue("/normalization/scale", "scale must be positive"));
    }
  }
  validateBounds(value.sourceBounds, "/sourceBounds", issues);

  if (!Array.isArray(value.strokes)) {
    issues.push(issue("/strokes", "strokes must be an array"));
  } else {
    if (
      value.strokes.length === 0 ||
      value.strokes.length > mathInkProxyLimits.maximumStrokeCount
    ) {
      issues.push(
        issue(
          "/strokes",
          `stroke count must be between 1 and ${mathInkProxyLimits.maximumStrokeCount}`,
        ),
      );
    }
    let totalPointCount = 0;
    const strokeIds = new Set();
    value.strokes.forEach((stroke, strokeIndex) => {
      const strokePath = `/strokes/${strokeIndex}`;
      if (!isRecord(stroke) || !hasOnlyKeys(stroke, strokeKeys)) {
        issues.push(issue(strokePath, "stroke must be a strict object"));
        return;
      }
      if (!validIdentifier(stroke.id) || strokeIds.has(stroke.id)) {
        issues.push(issue(`${strokePath}/id`, "stroke identifier is invalid or repeated"));
      } else {
        strokeIds.add(stroke.id);
      }
      if (!Array.isArray(stroke.points)) {
        issues.push(issue(`${strokePath}/points`, "points must be an array"));
        return;
      }
      totalPointCount += stroke.points.length;
      if (
        stroke.points.length < 2 ||
        stroke.points.length > mathInkProxyLimits.maximumPointsPerStroke
      ) {
        issues.push(
          issue(
            `${strokePath}/points`,
            `point count must be between 2 and ${mathInkProxyLimits.maximumPointsPerStroke}`,
          ),
        );
      }
      let previousTime = -1;
      stroke.points.forEach((point, pointIndex) => {
        const pointPath = `${strokePath}/points/${pointIndex}`;
        if (!isRecord(point) || !hasOnlyKeys(point, pointKeys)) {
          issues.push(issue(pointPath, "point must be a strict object"));
          return;
        }
        if (
          !finiteNumber(point.x) ||
          point.x < 0 ||
          point.x > 1 ||
          !finiteNumber(point.y) ||
          point.y < 0 ||
          point.y > 1
        ) {
          issues.push(issue(pointPath, "point coordinates must be finite in [0, 1]"));
        }
        if (
          !finiteNumber(point.timeMs) ||
          point.timeMs < 0 ||
          point.timeMs < previousTime
        ) {
          issues.push(issue(`${pointPath}/timeMs`, "point time must be monotonic"));
        } else {
          previousTime = point.timeMs;
        }
      });
    });
    if (totalPointCount > mathInkProxyLimits.maximumTotalPointCount) {
      issues.push(
        issue(
          "/strokes",
          `total point count exceeds ${mathInkProxyLimits.maximumTotalPointCount}`,
        ),
      );
    }
  }
  return issues.length === 0
    ? { valid: true, value }
    : { issues, valid: false };
}

export function createMathpixStrokeRequest(request) {
  const scale = mathInkProxyLimits.providerCoordinateScale;
  return {
    formats: ["latex_styled", "text"],
    metadata: {
      improve_mathpix: false,
      tutorboard_request_id: request.recognitionId,
    },
    strokes: {
      strokes: {
        x: request.strokes.map((stroke) =>
          stroke.points.map((point) => Math.round(point.x * scale)),
        ),
        y: request.strokes.map((stroke) =>
          stroke.points.map((point) => Math.round(point.y * scale)),
        ),
      },
    },
  };
}

export function stripOuterMathDelimiters(value) {
  let result = value.trim();
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

function boundedString(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : null;
}

export function normalizeMathpixResponse(payload, requestId) {
  if (!isRecord(payload)) {
    return { code: "math-ink.provider-invalid-response", valid: false };
  }
  const expressionSource =
    boundedString(payload.latex_styled, 4_096) ??
    boundedString(payload.text, 4_096);
  const providerRequestId = boundedString(payload.request_id, 256);
  const providerVersion = boundedString(payload.version, 128) ?? "unknown";
  const confidence =
    finiteNumber(payload.confidence) &&
    payload.confidence >= 0 &&
    payload.confidence <= 1
      ? payload.confidence
      : undefined;
  if (expressionSource === null) {
    return {
      valid: true,
      value: {
        candidates: [],
        diagnostics: [
          {
            code: "math-ink.provider-unrecognized",
            message: "Mathpix did not return a mathematical expression.",
            severity: "warning",
          },
        ],
        provider: "mathpix",
        providerRequestId,
        providerVersion,
        requestId,
        schemaVersion: mathInkProxyResultSchemaVersion,
        status: "unrecognized",
      },
    };
  }
  const expression = stripOuterMathDelimiters(expressionSource);
  if (expression.length === 0 || expression.length > 4_096) {
    return { code: "math-ink.provider-invalid-response", valid: false };
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
      provider: "mathpix",
      providerRequestId,
      providerVersion,
      requestId,
      schemaVersion: mathInkProxyResultSchemaVersion,
      status: "recognized",
    },
  };
}
