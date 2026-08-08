import type {
  ActorId,
  Solid3DId,
  SolidLearningAttemptId,
} from "../board/identifiers";
import {
  maximumLearningDiagnostics,
  maximumLearningHints,
  maximumLearningTraceActions,
  type Solid3DLearningAttempt,
  type SolidLearningAttemptAction,
  type SolidLearningMode,
  type SolidLearningResult,
} from "./types";

function bounded<T>(values: readonly T[], maximum: number): readonly T[] {
  return values.slice(Math.max(0, values.length - maximum));
}

export function createSolidLearningAttempt(input: {
  readonly actorId: ActorId;
  readonly id: SolidLearningAttemptId;
  readonly mode: SolidLearningMode;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly solidId: Solid3DId;
  readonly timestamp: string;
}): Solid3DLearningAttempt {
  return {
    actorId: input.actorId,
    answers: [],
    checkpoints: [],
    construction: { completed: false, trace: [] },
    diagnostics: [],
    hints: [],
    id: input.id,
    mode: input.mode,
    phase: input.mode === "teacher-demo" ? "construction" : "intro",
    prediction: null,
    quizAnswers: {},
    reasoning: [],
    result: null,
    revision: 0,
    scenarioId: input.scenarioId,
    scenarioVersion: input.scenarioVersion,
    schemaVersion: "1.0",
    solidId: input.solidId,
    startedAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

export function applySolidLearningAction(
  current: Solid3DLearningAttempt,
  action: SolidLearningAttemptAction,
  timestamp: string,
): Solid3DLearningAttempt {
  const nextRevision = current.revision + 1;
  if (action.kind === "restore") {
    return {
      ...action.snapshot,
      id: current.id,
      solidId: current.solidId,
      actorId: current.actorId,
      revision: nextRevision,
      updatedAt: timestamp,
    };
  }
  const base = { ...current, revision: nextRevision, updatedAt: timestamp };
  switch (action.kind) {
    case "set-phase":
      return { ...base, phase: action.phase };
    case "submit-prediction":
      return { ...base, phase: "construction", prediction: action.prediction };
    case "construction-step": {
      const trace = bounded(
        [...current.construction.trace, action.entry],
        maximumLearningTraceActions,
      );
      const completed =
        action.entry.accepted && action.entry.action.kind === "close-contour";
      return {
        ...base,
        construction: {
          completed: current.construction.completed || completed,
          trace,
        },
        phase: completed ? "reasoning" : current.phase,
      };
    }
    case "add-reasoning":
      return { ...base, reasoning: [...current.reasoning, action.step] };
    case "submit-answer":
      return { ...base, answers: [...current.answers, action.answer] };
    case "use-hint":
      return {
        ...base,
        hints: bounded([...current.hints, action.hint], maximumLearningHints),
      };
    case "add-diagnostic":
      return {
        ...base,
        diagnostics: bounded(
          [...current.diagnostics, action.diagnostic],
          maximumLearningDiagnostics,
        ),
      };
    case "add-checkpoint":
      return {
        ...base,
        checkpoints: [...current.checkpoints, action.checkpoint].slice(-32),
      };
    case "answer-quiz":
      return {
        ...base,
        quizAnswers: { ...current.quizAnswers, [action.itemId]: action.answer },
      };
  }
}

function ratio(correct: number, total: number): number {
  return total === 0 ? 0 : correct / total;
}

export function summarizeSolidLearningAttempt(
  attempt: Solid3DLearningAttempt,
  quizScore = 0,
): SolidLearningResult {
  const acceptedSteps = attempt.construction.trace.filter(
    ({ accepted }) => accepted,
  ).length;
  const maximumHintLevel = Math.max(
    0,
    ...attempt.hints.map(({ level }) => level),
  );
  const predictionScore = attempt.prediction?.score ?? 0;
  const constructionAccuracy = ratio(
    acceptedSteps,
    attempt.construction.trace.length,
  );
  const reasoningAccuracy = ratio(
    attempt.reasoning.filter(({ accepted }) => accepted).length,
    attempt.reasoning.length,
  );
  const measurementAccuracy = ratio(
    attempt.answers.filter(({ correct }) => correct).length,
    attempt.answers.length,
  );
  return {
    completed: attempt.construction.completed,
    constructionAccuracy,
    maximumHintLevel,
    measurementAccuracy,
    predictionScore,
    quizScore,
    reasoningAccuracy,
    skillScores: {
      calculation: measurementAccuracy,
      construction: constructionAccuracy,
      proof: reasoningAccuracy,
      spatialPrediction: predictionScore,
    },
  };
}

export function resetSolidLearningAttempt(
  current: Solid3DLearningAttempt,
  timestamp: string,
): Solid3DLearningAttempt {
  return {
    ...createSolidLearningAttempt({
      actorId: current.actorId,
      id: current.id,
      mode: current.mode,
      scenarioId: current.scenarioId,
      scenarioVersion: current.scenarioVersion,
      solidId: current.solidId,
      timestamp: current.startedAt,
    }),
    revision: current.revision + 1,
    updatedAt: timestamp,
  };
}
