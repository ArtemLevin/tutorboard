import type {
  BoardObjectId,
  CommandId,
  GeometryImportId,
} from "../../core/public";

export type GeometryChangeKind =
  | "construction-translation"
  | "constrained-point-move"
  | "independent-point-move"
  | "label-offset"
  | "semantic-delete"
  | "style-override"
  | "unknown";

export type GeometryChangeClassification =
  "mathematical" | "unknown" | "visual";

export interface GeometryMovementDecision {
  readonly allowed: boolean;
  readonly canonicalGirMutation: false;
  readonly classification: GeometryChangeClassification;
  readonly reason: string;
}

export interface GeometryMovementExperimentEvent extends GeometryMovementDecision {
  readonly commandId: CommandId;
  readonly importId: GeometryImportId;
  readonly kind: GeometryChangeKind;
  readonly objectId: BoardObjectId | null;
  readonly timestamp: string;
}

export interface GeometryMovementExperimentLogger {
  record(event: GeometryMovementExperimentEvent): void;
}

export const geometryMovementFeatureFlags = {
  independentPointDrag: false,
} as const;

const decisions: Readonly<
  Record<GeometryChangeKind, GeometryMovementDecision>
> = {
  "construction-translation": {
    allowed: true,
    canonicalGirMutation: false,
    classification: "visual",
    reason: "Move the import visual transform without changing local geometry.",
  },
  "label-offset": {
    allowed: true,
    canonicalGirMutation: false,
    classification: "visual",
    reason: "Store a per-label visual transform override.",
  },
  "style-override": {
    allowed: true,
    canonicalGirMutation: false,
    classification: "visual",
    reason: "Store presentation changes separately from canonical GIR.",
  },
  "independent-point-move": {
    allowed: false,
    canonicalGirMutation: false,
    classification: "mathematical",
    reason:
      "Point movement requires a GeometryOS semantic edit/recompute contract.",
  },
  "constrained-point-move": {
    allowed: false,
    canonicalGirMutation: false,
    classification: "mathematical",
    reason:
      "Constrained point movement cannot be represented as a visual override.",
  },
  "semantic-delete": {
    allowed: false,
    canonicalGirMutation: false,
    classification: "mathematical",
    reason: "Semantic deletion requires an explicit GIR edit contract.",
  },
  unknown: {
    allowed: false,
    canonicalGirMutation: false,
    classification: "unknown",
    reason: "Unknown geometry changes are denied by default.",
  },
};

export function classifyGeometryChange(
  kind: GeometryChangeKind,
): GeometryMovementDecision {
  return decisions[kind];
}

export function recordGeometryMovementDecision(
  logger: GeometryMovementExperimentLogger,
  input: {
    readonly commandId: CommandId;
    readonly importId: GeometryImportId;
    readonly kind: GeometryChangeKind;
    readonly objectId?: BoardObjectId;
    readonly timestamp: string;
  },
): GeometryMovementDecision {
  const decision = classifyGeometryChange(input.kind);
  logger.record({
    ...decision,
    commandId: input.commandId,
    importId: input.importId,
    kind: input.kind,
    objectId: input.objectId ?? null,
    timestamp: input.timestamp,
  });
  return decision;
}

export class InMemoryGeometryMovementExperimentLog implements GeometryMovementExperimentLogger {
  readonly #events: GeometryMovementExperimentEvent[] = [];

  record(event: GeometryMovementExperimentEvent): void {
    this.#events.push(event);
  }

  snapshot(): readonly GeometryMovementExperimentEvent[] {
    return structuredClone(this.#events);
  }
}
