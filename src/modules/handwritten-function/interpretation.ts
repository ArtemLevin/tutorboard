import {
  compilePlotExpression,
  maximumCoordinatePlotParameters,
  validatePlotParameterName,
  type ExpressionDiagnostic,
} from "../../core/public";
import { convertHandwrittenFunctionCandidate } from "./expression-conversion";
import {
  handwrittenFunctionInterpretationLimits,
  handwrittenFunctionInterpretationSchemaVersion,
  type HandwrittenFunctionInterpretation,
  type HandwrittenFunctionInterpretationDiagnostic,
  type HandwrittenFunctionInterpretedCandidate,
} from "./interpretation-types";
import type {
  MathInkRecognitionCandidate,
  MathInkRecognitionDiagnostic,
  MathInkRecognitionResult,
} from "./types";

function providerDiagnostic(
  diagnostic: MathInkRecognitionDiagnostic,
): HandwrittenFunctionInterpretationDiagnostic {
  return {
    candidateIndex: null,
    code: "handwriting.interpretation.provider",
    message: `${diagnostic.code}: ${diagnostic.message}`,
    severity: diagnostic.severity,
  };
}

function compilerDiagnostic(
  candidateIndex: number,
  diagnostic: ExpressionDiagnostic,
): HandwrittenFunctionInterpretationDiagnostic {
  return {
    candidateIndex,
    code: diagnostic.code,
    end: diagnostic.end,
    message: diagnostic.message,
    severity: "error",
    start: diagnostic.start,
  };
}

function conversionDiagnostic(
  candidateIndex: number,
  diagnostic: ReturnType<
    typeof convertHandwrittenFunctionCandidate
  > extends infer Result
    ? Result extends {
        readonly ok: false;
        readonly diagnostic: infer Diagnostic;
      }
      ? Diagnostic
      : never
    : never,
): HandwrittenFunctionInterpretationDiagnostic {
  return {
    candidateIndex,
    code: diagnostic.code,
    message: diagnostic.message,
    severity: "error",
    ...(diagnostic.start === undefined ? {} : { start: diagnostic.start }),
    ...(diagnostic.end === undefined ? {} : { end: diagnostic.end }),
  };
}

function parameterNamesFromDiagnostics(
  expression: string,
  diagnostics: readonly ExpressionDiagnostic[],
): readonly string[] {
  const ordered = diagnostics
    .filter(({ code }) => code === "expression.unknown-identifier")
    .map((diagnostic) => ({
      name: expression.slice(diagnostic.start, diagnostic.end),
      start: diagnostic.start,
    }))
    .sort((left, right) => left.start - right.start);
  const names: string[] = [];
  for (const { name } of ordered) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

function unknownIdentifierCall(
  expression: string,
  diagnostics: readonly ExpressionDiagnostic[],
): {
  readonly end: number;
  readonly name: string;
  readonly start: number;
} | null {
  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== "expression.unknown-identifier") continue;
    const name = expression.slice(diagnostic.start, diagnostic.end);
    if (name.length <= 1) continue;
    let nextIndex = diagnostic.end;
    while (/\s/u.test(expression[nextIndex] ?? "")) nextIndex += 1;
    if (expression[nextIndex] === "(") {
      return { end: diagnostic.end, name, start: diagnostic.start };
    }
  }
  return null;
}

function interpretCandidate(
  candidate: MathInkRecognitionCandidate,
  candidateIndex: number,
): {
  readonly candidate: HandwrittenFunctionInterpretedCandidate | null;
  readonly diagnostics: readonly HandwrittenFunctionInterpretationDiagnostic[];
} {
  const converted = convertHandwrittenFunctionCandidate(candidate);
  if (!converted.ok) {
    return {
      candidate: null,
      diagnostics: [conversionDiagnostic(candidateIndex, converted.diagnostic)],
    };
  }

  const firstCompile = compilePlotExpression(converted.expression, {
    context: "explicit-function",
    parameterNames: [],
  });
  if (firstCompile.ok) {
    return {
      candidate: {
        candidateIndex,
        confidence:
          candidate.confidence === undefined ||
          !Number.isFinite(candidate.confidence)
            ? null
            : candidate.confidence,
        expression: converted.expression,
        normalizedExpression: firstCompile.expression.normalizedSource,
        parameters: [],
        sourceExpression: candidate.expression,
        sourceFormat: candidate.format,
      },
      diagnostics: [],
    };
  }

  const blocking = firstCompile.diagnostics.filter(
    ({ code }) => code !== "expression.unknown-identifier",
  );
  if (blocking.length > 0) {
    return {
      candidate: null,
      diagnostics: blocking.map((diagnostic) =>
        compilerDiagnostic(candidateIndex, diagnostic),
      ),
    };
  }

  const unsupportedCall = unknownIdentifierCall(
    converted.expression,
    firstCompile.diagnostics,
  );
  if (unsupportedCall !== null) {
    return {
      candidate: null,
      diagnostics: [
        {
          candidateIndex,
          code: "handwriting.interpretation.unsupported-function",
          end: unsupportedCall.end,
          message: `Функция ${unsupportedCall.name} не поддерживается языком графиков.`,
          severity: "error",
          start: unsupportedCall.start,
        },
      ],
    };
  }

  const parameters = parameterNamesFromDiagnostics(
    converted.expression,
    firstCompile.diagnostics,
  );
  if (parameters.length > maximumCoordinatePlotParameters) {
    return {
      candidate: null,
      diagnostics: [
        {
          candidateIndex,
          code: "handwriting.interpretation.parameter-limit",
          message: `Функция содержит больше ${maximumCoordinatePlotParameters} параметров.`,
          severity: "error",
        },
      ],
    };
  }

  const invalidParameter = parameters.find(
    (name, index) =>
      validatePlotParameterName(name, parameters.slice(0, index)) !== null,
  );
  if (invalidParameter !== undefined) {
    return {
      candidate: null,
      diagnostics: [
        {
          candidateIndex,
          code: "handwriting.interpretation.invalid-parameter",
          message: `Имя ${invalidParameter} нельзя использовать как параметр графика.`,
          severity: "error",
        },
      ],
    };
  }

  const finalCompile = compilePlotExpression(converted.expression, {
    context: "explicit-function",
    parameterNames: parameters,
  });
  if (!finalCompile.ok) {
    return {
      candidate: null,
      diagnostics: finalCompile.diagnostics.map((diagnostic) =>
        compilerDiagnostic(candidateIndex, diagnostic),
      ),
    };
  }

  return {
    candidate: {
      candidateIndex,
      confidence:
        candidate.confidence === undefined ||
        !Number.isFinite(candidate.confidence)
          ? null
          : candidate.confidence,
      expression: converted.expression,
      normalizedExpression: finalCompile.expression.normalizedSource,
      parameters,
      sourceExpression: candidate.expression,
      sourceFormat: candidate.format,
    },
    diagnostics: [],
  };
}

const formatRank = {
  jiix: 0,
  latex: 1,
  "plot-expression": 2,
} as const;

function confidence(
  candidate: HandwrittenFunctionInterpretedCandidate,
): number {
  return candidate.confidence ?? -1;
}

function rankCandidates(
  candidates: readonly HandwrittenFunctionInterpretedCandidate[],
): readonly HandwrittenFunctionInterpretedCandidate[] {
  return [...candidates].sort((left, right) => {
    const confidenceDifference = confidence(right) - confidence(left);
    if (confidenceDifference !== 0) return confidenceDifference;
    const formatDifference =
      formatRank[right.sourceFormat] - formatRank[left.sourceFormat];
    if (formatDifference !== 0) return formatDifference;
    const parameterDifference =
      left.parameters.length - right.parameters.length;
    return parameterDifference !== 0
      ? parameterDifference
      : left.candidateIndex - right.candidateIndex;
  });
}

function canonicalKey(
  candidate: HandwrittenFunctionInterpretedCandidate,
): string {
  return `${candidate.normalizedExpression.replace(/\s+/gu, "")}\u0000${candidate.parameters.join("\u0000")}`;
}

function distinctCandidates(
  candidates: readonly HandwrittenFunctionInterpretedCandidate[],
): readonly HandwrittenFunctionInterpretedCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = canonicalKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decisiveLead(
  first: HandwrittenFunctionInterpretedCandidate,
  second: HandwrittenFunctionInterpretedCandidate,
): boolean {
  if (first.confidence === null) return false;
  if (second.confidence === null) return true;
  return (
    first.confidence - second.confidence >=
    handwrittenFunctionInterpretationLimits.ambiguityConfidenceMargin
  );
}

export function interpretMathInkRecognitionResult(
  result: MathInkRecognitionResult,
): HandwrittenFunctionInterpretation {
  const diagnostics: HandwrittenFunctionInterpretationDiagnostic[] =
    result.diagnostics.map(providerDiagnostic);
  const limitedCandidates = result.candidates.slice(
    0,
    handwrittenFunctionInterpretationLimits.maximumCandidateCount,
  );
  if (result.candidates.length > limitedCandidates.length) {
    diagnostics.push({
      candidateIndex: null,
      code: "handwriting.interpretation.candidate-limit",
      message: `Обработаны первые ${handwrittenFunctionInterpretationLimits.maximumCandidateCount} кандидатов.`,
      severity: "warning",
    });
  }

  const interpreted: HandwrittenFunctionInterpretedCandidate[] = [];
  limitedCandidates.forEach((candidate, candidateIndex) => {
    const outcome = interpretCandidate(candidate, candidateIndex);
    diagnostics.push(...outcome.diagnostics);
    if (outcome.candidate !== null) interpreted.push(outcome.candidate);
  });

  const ranked = rankCandidates(interpreted);
  const distinct = distinctCandidates(ranked);
  if (distinct.length === 0) {
    diagnostics.push({
      candidateIndex: null,
      code: "handwriting.interpretation.no-valid-candidate",
      message: "Распознаватель не вернул исполнимую явную функцию.",
      severity: "error",
    });
    return {
      candidates: ranked,
      diagnostics,
      schemaVersion: handwrittenFunctionInterpretationSchemaVersion,
      selected: null,
      status: "rejected",
    };
  }

  const first = distinct[0]!;
  const second = distinct[1];
  const upstreamUnrecognized = result.status === "unrecognized";
  const ambiguous =
    upstreamUnrecognized ||
    (second !== undefined && !decisiveLead(first, second));
  if (ambiguous) {
    diagnostics.push({
      candidateIndex: first.candidateIndex,
      code: "handwriting.interpretation.ambiguous",
      message: upstreamUnrecognized
        ? "Распознаватель пометил результат как неуверенный; требуется подтверждение."
        : "Несколько вариантов функции имеют близкий приоритет.",
      severity: "warning",
    });
    return {
      candidates: ranked,
      diagnostics,
      schemaVersion: handwrittenFunctionInterpretationSchemaVersion,
      selected: null,
      status: "ambiguous",
    };
  }

  return {
    candidates: ranked,
    diagnostics,
    schemaVersion: handwrittenFunctionInterpretationSchemaVersion,
    selected: first,
    status: "accepted",
  };
}
