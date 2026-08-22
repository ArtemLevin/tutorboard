import { resolveSmartInkReleaseGate } from "../../shared/smart-ink-release";

export type AppStage = "development" | "test" | "production";
export type AppProfile = "board" | "full";

export interface AppEnvironment {
  readonly boardApiBaseUrl: string;
  readonly features: AppFeatureFlags;
  readonly geometryOsBaseUrl: string;
  readonly mathInkApiBaseUrl: string;
  readonly profile: AppProfile;
  readonly stage: AppStage;
}

export interface AppFeatureFlags {
  readonly developmentDiagnostics: boolean;
  readonly documentSnapshots: boolean;
  readonly geometryPrompt: boolean;
  readonly handwrittenFunctions: boolean;
  readonly mathInkRecognition: boolean;
  readonly serverSync: boolean;
  readonly smartInk: boolean;
  readonly smartInkDiagnostics: boolean;
  readonly solid3D: boolean;
  readonly solid3DLearning: boolean;
}

export interface AppFeatureFlagInput {
  readonly developmentDiagnostics?: string | undefined;
  readonly documentSnapshots?: string | undefined;
  readonly geometryPrompt?: string | undefined;
  readonly handwrittenFunctions?: string | undefined;
  readonly mathInkRecognition?: string | undefined;
  readonly serverSync?: string | undefined;
  readonly smartInk?: string | undefined;
  readonly smartInkDiagnostics?: string | undefined;
  readonly solid3D?: string | undefined;
  readonly solid3DLearning?: string | undefined;
}

const stages = new Set<AppStage>(["development", "test", "production"]);
const profiles = new Set<AppProfile>(["board", "full"]);

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

function sameOriginPath(name: string, value: string): string {
  const url = new URL(value, "http://localhost");
  if (
    url.origin !== "http://localhost" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${name} must be a same-origin path without credentials.`);
  }
  return url.pathname.replace(/\/+$/u, "");
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
    mathInkRecognition: import.meta.env.VITE_FEATURE_MATH_INK_RECOGNITION,
    serverSync: import.meta.env.VITE_FEATURE_SERVER_SYNC,
    smartInk: import.meta.env.VITE_FEATURE_SMART_INK,
    smartInkDiagnostics: import.meta.env.VITE_FEATURE_SMART_INK_DIAGNOSTICS,
    solid3D: import.meta.env.VITE_FEATURE_SOLID_3D,
    solid3DLearning: import.meta.env.VITE_FEATURE_SOLID_3D_LEARNING,
  },
  boardApiBaseUrl: string | undefined = import.meta.env.VITE_BOARD_API_BASE_URL,
  mathInkApiBaseUrl: string | undefined = import.meta.env
    .VITE_MATH_INK_API_BASE_URL,
  profileValue: string | undefined = import.meta.env.VITE_APP_PROFILE,
): AppEnvironment {
  const stage = value ?? "development";
  const profile = profileValue ?? "full";

  if (!stages.has(stage as AppStage)) {
    throw new Error(`Unsupported VITE_APP_STAGE: ${stage}`);
  }
  if (!profiles.has(profile as AppProfile)) {
    throw new Error(`Unsupported VITE_APP_PROFILE: ${profile}`);
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

  const boardProfile = profile === "board";
  const smartInk = resolveSmartInkReleaseGate(
    stage,
    featureInput.smartInk ?? (boardProfile ? "false" : undefined),
  );
  const smartInkDiagnostics = booleanFlag(
    "VITE_FEATURE_SMART_INK_DIAGNOSTICS",
    featureInput.smartInkDiagnostics,
    stage !== "production",
  );
  const solid3D = booleanFlag(
    "VITE_FEATURE_SOLID_3D",
    featureInput.solid3D,
    stage !== "production",
  );

  const features: AppFeatureFlags = {
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
      !boardProfile,
    ),
    handwrittenFunctions: booleanFlag(
      "VITE_FEATURE_HANDWRITTEN_FUNCTIONS",
      featureInput.handwrittenFunctions,
      boardProfile ? false : stage !== "production",
    ),
    mathInkRecognition: booleanFlag(
      "VITE_FEATURE_MATH_INK_RECOGNITION",
      featureInput.mathInkRecognition,
      false,
    ),
    serverSync: booleanFlag(
      "VITE_FEATURE_SERVER_SYNC",
      featureInput.serverSync,
      boardProfile || stage === "production",
    ),
    smartInk,
    smartInkDiagnostics: smartInk && smartInkDiagnostics,
    solid3D,
    solid3DLearning:
      solid3D &&
      booleanFlag(
        "VITE_FEATURE_SOLID_3D_LEARNING",
        featureInput.solid3DLearning,
        stage !== "production",
      ),
  };

  if (boardProfile) {
    const conflicts = [
      ...(features.serverSync ? [] : ["VITE_FEATURE_SERVER_SYNC=false"]),
      ...(features.documentSnapshots
        ? []
        : ["VITE_FEATURE_DOCUMENT_SNAPSHOTS=false"]),
      ...(features.geometryPrompt ? ["VITE_FEATURE_GEOMETRY_PROMPT=true"] : []),
      ...(features.handwrittenFunctions
        ? ["VITE_FEATURE_HANDWRITTEN_FUNCTIONS=true"]
        : []),
      ...(features.mathInkRecognition
        ? ["VITE_FEATURE_MATH_INK_RECOGNITION=true"]
        : []),
      ...(features.smartInk ? ["VITE_FEATURE_SMART_INK=true"] : []),
    ];
    if (conflicts.length > 0) {
      throw new Error(
        `Board profile feature conflict: ${conflicts.join(", ")}.`,
      );
    }
  }

  return {
    boardApiBaseUrl: sameOriginPath(
      "VITE_BOARD_API_BASE_URL",
      boardApiBaseUrl ?? "/api/v1",
    ),
    features,
    geometryOsBaseUrl: geometryOsUrl.href.replace(/\/$/, ""),
    mathInkApiBaseUrl: sameOriginPath(
      "VITE_MATH_INK_API_BASE_URL",
      mathInkApiBaseUrl ?? "/api/v1/formula-recognition",
    ),
    profile: profile as AppProfile,
    stage: stage as AppStage,
  };
}
