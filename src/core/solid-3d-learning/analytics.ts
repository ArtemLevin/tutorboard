import type { Solid3DLearningAttempt } from "./types";

export interface SolidLearningAnalytics {
  readonly attemptId: string;
  readonly durationSeconds: number;
  readonly predictionScore: number;
  readonly acceptedSteps: number;
  readonly rejectedSteps: number;
  readonly hintCounts: Readonly<Record<string, number>>;
  readonly diagnosticCounts: Readonly<Record<string, number>>;
  readonly skillScores: Readonly<Record<string, number>>;
}

function counts(values: readonly string[]): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

export function analyzeSolidLearningAttempt(
  attempt: Solid3DLearningAttempt,
): SolidLearningAnalytics {
  return {
    acceptedSteps: attempt.construction.trace.filter(({ accepted }) => accepted)
      .length,
    attemptId: attempt.id,
    diagnosticCounts: counts(attempt.diagnostics.map(({ code }) => code)),
    durationSeconds: Math.max(
      0,
      (Date.parse(attempt.updatedAt) - Date.parse(attempt.startedAt)) / 1_000,
    ),
    hintCounts: counts(
      attempt.hints.map(({ level }) => `level-${String(level)}`),
    ),
    predictionScore: attempt.prediction?.score ?? 0,
    rejectedSteps: attempt.construction.trace.filter(
      ({ accepted }) => !accepted,
    ).length,
    skillScores: attempt.result?.skillScores ?? {},
  };
}

export function exportLearningAnalyticsJson(
  attempts: readonly Solid3DLearningAttempt[],
): string {
  return JSON.stringify(attempts.map(analyzeSolidLearningAttempt), null, 2);
}

export function exportLearningAnalyticsCsv(
  attempts: readonly Solid3DLearningAttempt[],
): string {
  const rows = attempts.map(analyzeSolidLearningAttempt);
  return [
    "attemptId,durationSeconds,predictionScore,acceptedSteps,rejectedSteps,hints,diagnostics",
    ...rows.map((row) =>
      [
        row.attemptId,
        row.durationSeconds,
        row.predictionScore,
        row.acceptedSteps,
        row.rejectedSteps,
        Object.values(row.hintCounts).reduce((a, b) => a + b, 0),
        Object.values(row.diagnosticCounts).reduce((a, b) => a + b, 0),
      ].join(","),
    ),
  ].join("\n");
}
