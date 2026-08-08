import type {
  CommandMetadata,
  Solid3DRecord,
  UpdateSolid3DCommand,
} from "../../core/public";

export function createUpdateSolid3DCommand(input: {
  readonly expected: Solid3DRecord;
  readonly metadata: CommandMetadata;
  readonly replacement: Solid3DRecord;
}): UpdateSolid3DCommand {
  return {
    ...input.metadata,
    expected: input.expected,
    kind: "core.solid-3d.update",
    replacement: input.replacement,
    solidId: input.expected.id,
  };
}
