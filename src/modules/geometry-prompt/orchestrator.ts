import {
  commandId,
  geometryImportId,
  type ActorId,
  type GeometryOsAmbiguity,
  type GeometryOsClient,
  type GeometryOsGenerateResult,
  type GeometryOsLayoutResult,
  type GeometryOsNotice,
  type GeometryOsRequestId,
  type ImportGeometryCommand,
  type Vec2,
} from "../../core/public";
import {
  createGeometryImportCommand,
  type GeometryImportDiagnostic,
} from "../geometry-import/public";

export type GeometryPromptStage =
  "generate" | "import" | "layout" | "readiness";

export interface GeometryPromptProgress {
  readonly requestId: GeometryOsRequestId | null;
  readonly stage: GeometryPromptStage;
}

interface GeometryPromptTrace {
  readonly requestIds: readonly GeometryOsRequestId[];
}

export type GeometryPromptResult =
  | (GeometryPromptTrace & {
      readonly command: ImportGeometryCommand;
      readonly diagnostics: readonly GeometryImportDiagnostic[];
      readonly kind: "success";
    })
  | (GeometryPromptTrace & {
      readonly ambiguities: readonly GeometryOsAmbiguity[];
      readonly explanation: string | null;
      readonly kind: "needs-clarification";
    })
  | (GeometryPromptTrace & {
      readonly explanation: string | null;
      readonly kind: "domain-error";
      readonly warnings: readonly GeometryOsNotice[];
    })
  | (GeometryPromptTrace & {
      readonly code: string;
      readonly kind: "failure";
      readonly requestId: GeometryOsRequestId | null;
      readonly retryable: boolean;
      readonly stage: GeometryPromptStage;
    })
  | (GeometryPromptTrace & {
      readonly kind: "cancelled";
    });

export interface StartGeometryPromptInput {
  readonly actorId: ActorId;
  readonly client: GeometryOsClient;
  readonly createToken: () => string;
  readonly now: () => string;
  readonly onProgress?: (progress: GeometryPromptProgress) => void;
  readonly prompt: string;
  readonly targetWorldCenter: Vec2;
}

export interface GeometryPromptOperation {
  readonly cancel: () => void;
  readonly result: Promise<GeometryPromptResult>;
}

type SharedFailure =
  | Extract<
      GeometryOsGenerateResult,
      | { readonly kind: "incompatible-contract" }
      | { readonly kind: "invalid-request" }
      | { readonly kind: "problem" }
      | { readonly kind: "transport-failure" }
    >
  | Extract<GeometryOsLayoutResult, { readonly kind: "invalid-request" }>;

function failure(
  result: SharedFailure,
  stage: GeometryPromptStage,
  requestIds: readonly GeometryOsRequestId[],
): GeometryPromptResult {
  return {
    kind: "failure",
    code: result.code,
    requestId: result.requestId,
    requestIds,
    retryable:
      result.kind === "problem" || result.kind === "transport-failure"
        ? result.retryable
        : false,
    stage,
  };
}

function unexpected(
  code: string,
  stage: GeometryPromptStage,
  requestId: GeometryOsRequestId,
  requestIds: readonly GeometryOsRequestId[],
  retryable = false,
): GeometryPromptResult {
  return {
    kind: "failure",
    code,
    requestId,
    requestIds,
    retryable,
    stage,
  };
}

export function startGeometryPrompt(
  input: StartGeometryPromptInput,
): GeometryPromptOperation {
  let cancelled = false;
  let cancelCurrent: (() => void) | null = null;

  const result = (async (): Promise<GeometryPromptResult> => {
    const requestIds: GeometryOsRequestId[] = [];
    if (input.prompt.trim().length === 0) {
      return {
        kind: "failure",
        code: "geometry-prompt.empty",
        requestId: null,
        requestIds,
        retryable: false,
        stage: "generate",
      };
    }

    const readinessTask = input.client.startReadiness();
    cancelCurrent = readinessTask.cancel;
    requestIds.push(readinessTask.requestId);
    input.onProgress?.({
      requestId: readinessTask.requestId,
      stage: "readiness",
    });
    const readiness = await readinessTask.result;
    if (readiness.kind === "cancelled" || cancelled) {
      return { kind: "cancelled", requestIds };
    }
    if (readiness.kind === "not-ready") {
      return unexpected(
        "geometryos.not-ready",
        "readiness",
        readiness.requestId,
        requestIds,
        true,
      );
    }
    if (readiness.kind !== "ready") {
      return failure(readiness, "readiness", requestIds);
    }

    const generateTask = input.client.startGenerate({ prompt: input.prompt });
    cancelCurrent = generateTask.cancel;
    requestIds.push(generateTask.requestId);
    input.onProgress?.({
      requestId: generateTask.requestId,
      stage: "generate",
    });
    const generated = await generateTask.result;
    if (generated.kind === "cancelled" || cancelled) {
      return { kind: "cancelled", requestIds };
    }
    if (generated.kind === "needs-clarification") {
      return {
        kind: "needs-clarification",
        ambiguities: generated.ambiguities,
        explanation: generated.explanation,
        requestIds,
      };
    }
    if (generated.kind === "domain-error") {
      return {
        kind: "domain-error",
        explanation: generated.explanation,
        requestIds,
        warnings: generated.warnings,
      };
    }
    if (generated.kind !== "success") {
      return failure(generated, "generate", requestIds);
    }

    const layoutTask = input.client.startLayout({
      canonicalGir: generated.canonicalGir,
    });
    cancelCurrent = layoutTask.cancel;
    requestIds.push(layoutTask.requestId);
    input.onProgress?.({
      requestId: layoutTask.requestId,
      stage: "layout",
    });
    const layout = await layoutTask.result;
    if (layout.kind === "cancelled" || cancelled) {
      return { kind: "cancelled", requestIds };
    }
    if (layout.kind === "unsupported") {
      return unexpected(
        "geometryos.layout-unsupported",
        "layout",
        layout.requestId,
        requestIds,
      );
    }
    if (layout.kind === "invalid-scene") {
      return unexpected(
        "geometryos.layout-invalid-scene",
        "layout",
        layout.requestId,
        requestIds,
      );
    }
    if (layout.kind !== "success") {
      return failure(layout, "layout", requestIds);
    }

    input.onProgress?.({ requestId: layout.requestId, stage: "import" });
    const token = input.createToken();
    const prepared = createGeometryImportCommand({
      importId: geometryImportId(`geometry-import:${token}`),
      layoutResult: layout,
      metadata: {
        actorId: input.actorId,
        id: commandId(`command:geometry-import:${token}`),
        timestamp: input.now(),
      },
      placement: {
        x: input.targetWorldCenter.x - layout.layoutDocument.width / 2,
        y: input.targetWorldCenter.y - layout.layoutDocument.height / 2,
      },
      prompt: input.prompt,
    });
    if (prepared.status === "failure") {
      return unexpected(prepared.code, "import", layout.requestId, requestIds);
    }
    return {
      kind: "success",
      command: prepared.command,
      diagnostics: prepared.diagnostics,
      requestIds,
    };
  })().finally(() => {
    cancelCurrent = null;
  });

  return {
    result,
    cancel(): void {
      cancelled = true;
      cancelCurrent?.();
    },
  };
}
