import {
  createSolidLearningAttempt,
  type ActSolid3DLearningCommand,
  type CommandMetadata,
  type CompleteSolid3DLearningCommand,
  type ResetSolid3DLearningCommand,
  type Solid3DLearningAttempt,
  type SolidLearningAttemptAction,
  type SolidLearningAttemptId,
  type SolidLearningMode,
  type Solid3DId,
  type StartSolid3DLearningCommand,
} from "../../core/public";

export function createStartSolidLearningCommand(input: {
  readonly attemptId: SolidLearningAttemptId;
  readonly metadata: CommandMetadata;
  readonly mode: SolidLearningMode;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly solidId: Solid3DId;
}): StartSolid3DLearningCommand {
  return {
    ...input.metadata,
    attempt: createSolidLearningAttempt({
      actorId: input.metadata.actorId,
      id: input.attemptId,
      mode: input.mode,
      scenarioId: input.scenarioId,
      scenarioVersion: input.scenarioVersion,
      solidId: input.solidId,
      timestamp: input.metadata.timestamp,
    }),
    kind: "core.solid-3d-learning.start",
  };
}

export function createSolidLearningActionCommand(input: {
  readonly action: SolidLearningAttemptAction;
  readonly attempt: Solid3DLearningAttempt;
  readonly metadata: CommandMetadata;
}): ActSolid3DLearningCommand {
  return {
    ...input.metadata,
    action: input.action,
    attemptId: input.attempt.id,
    expectedRevision: input.attempt.revision,
    kind: "core.solid-3d-learning.act",
  };
}

export function createResetSolidLearningCommand(input: {
  readonly attempt: Solid3DLearningAttempt;
  readonly metadata: CommandMetadata;
}): ResetSolid3DLearningCommand {
  return {
    ...input.metadata,
    attemptId: input.attempt.id,
    expectedRevision: input.attempt.revision,
    kind: "core.solid-3d-learning.reset",
  };
}

export function createCompleteSolidLearningCommand(input: {
  readonly attempt: Solid3DLearningAttempt;
  readonly metadata: CommandMetadata;
}): CompleteSolid3DLearningCommand {
  return {
    ...input.metadata,
    attemptId: input.attempt.id,
    expectedRevision: input.attempt.revision,
    kind: "core.solid-3d-learning.complete",
  };
}
