import { resolveSmartInkReleaseGate } from "../../shared/smart-ink-release";

export type AppStage = "development" | "test" | "production";

export interface AppEnvironment {
  readonly boardApiBaseUrl: string;
  readonly features: AppFeatureFlags;
  readonly geometryOsBaseUrl: string;
  readonly stage: AppStage;
}

export interface AppFeatureFlags {
  readonly developmentDiagnostics: boolean;
  readonly documentSnapshots: boolean;
  readonly geometryPrompt: boolean;
  readonly handwrittenFunctions: boolean;
  readonly serverSync: boolean;
  readonly smartInk: boolean;
  readonly smartInkDiagnostics: boolean;
}

export interface AppFeatureFlagInput {
  readonly developmentDiagnostics?: string | undefined;
  readonly documentSnapshots?: string | undefined;
  readonly geometryPrompt?: string | undefined;
  readonly handwrittenFunctions?: string | undefined;
  readonly serverSync?: string | undefined;
  readonly smartInk?: string | undefined;
  readonly smartInkDiagnostics?: string | undefined;
}

const stages = new Set<AppStage>(["development", "test", "production"]);

function booleanFlag(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new Error(`${name} must be true, false, 1 or 0.`);
}

export function readEnvironment(
  value: string | undefined = import.meta.env.VITE_APP_STAGE,
  geometryOsBaseUrl: string | undefined = import.meta.env
    .VITE_GEOMETRYOS_BASE_URL,
  featureInput: AppFeatureFlagInput = {
    developmentDiagnostics: import.meta.env.VITE_FEATURE_DEV_DIAGNOSTICS,
    documentSnapshots: import.meta.env.VITE_FEATURE_DOCUMENT_SNAPSHOTS,
    geometryPrompt: import.meta.env.VITE_FEATURE_GEOMETRY_PROMPT,
    handwrittenFunctions: import.meta.env.VITE_FEATURE_HANDWRITTEN_FUNCTIONS,
    serverSync: import.meta.env.VITE_FEATURE_SERVER_SYNC,
    smartInk: import.meta.env.VITE_FEATURE_SMART_INK,
    smartInkDiagnostics: import.meta.env.VITE_FEATURE_SMART_INK_DIAGNOSTICS,
  },
  boardApiBaseUrl: string | undefined = import.meta.env.VITE_BOARD_API_BASE_URL,
): AppEnvironment {
  const stage = value ?? "development";

  if (!stages.has(stage as AppStage)) {
    throw new Error(`Unsupported VITE_APP_STAGE: ${stage}`);
  }

  const runtimeOrigin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const geometryOsUrl = new URL(
    geometryOsBaseUrl ?? "/api/v1/geometryos/",
    runtimeOrigin,
  );
  if (
    (geometryOsUrl.protocol !== "http:" &&
      geometryOsUrl.protocol !== "https:") ||
    geometryOsUrl.username !== "" ||
    geometryOsUrl.password !== "" ||
    geometryOsUrl.search !== "" ||
    geometryOsUrl.hash !== ""
  ) {
    throw new Error("VITE_GEOMETRYOS_BASE_URL must be a public HTTP(S) URL.");
  }

  const boardApiUrl = new URL(boardApiBaseUrl ?? "/api/v1", "http://localhost");
  if (
    boardApiUrl.origin !== "http://localhost" ||
    boardApiUrl.username !== "" ||
    boardApiUrl.password !== "" ||
    boardApiUrl.search !== "" ||
    boardApiUrl.hash !== ""
  ) {
    throw new Error(
      "VITE_BOARD_API_BASE_URL must be a same-origin path without credentials.",
    );
  }

  const smartInk = resolveSmartInkReleaseGate(stage, featureInput.smartInk);
  const smartInkDiagnostics = booleanFlag(
    "VITE_FEATURE_SMART_INK_DIAGNOSTICS",
    featureInput.smartInkDiagnostics,
    stage !== "production",
  );

  return {
    boardApiBaseUrl: boardApiUrl.pathname.replace(/\/+$/u, ""),
    features: {
      developmentDiagnostics: booleanFlag(
        "VITE_FEATURE_DEV_DIAGNOSTICS",
        featureInput.developmentDiagnostics,
        stage !== "production",
      ),
      documentSnapshots: booleanFlag(
        "VITE_FEATURE_DOCUMENT_SNAPSHOTS",
        featureInput.documentSnapshots,
        true,
      ),
      geometryPrompt: booleanFlag(
        "VITE_FEATURE_GEOMETRY_PROMPT",
        featureInput.geometryPrompt,
        true,
      ),
      handwrittenFunctions: booleanFlag(
        "VITE_FEATURE_HANDWRITTEN_FUNCTIONS",
        featureInput.handwrittenFunctions,
        stage !== "production",
      ),
      serverSync: booleanFlag(
        "VITE_FEATURE_SERVER_SYNC",
        featureInput.serverSync,
        stage === "production",
      ),
      smartInk,
      smartInkDiagnostics: smartInk && smartInkDiagnostics,
    },
    geometryOsBaseUrl: geometryOsUrl.href.replace(/\/$/, ""),
    stage: stage as AppStage,
  };
}
