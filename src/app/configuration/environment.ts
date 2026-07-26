export type AppStage = "development" | "test" | "production";

export interface AppEnvironment {
  readonly geometryOsBaseUrl: string;
  readonly stage: AppStage;
}

const stages = new Set<AppStage>(["development", "test", "production"]);

export function readEnvironment(
  value: string | undefined = import.meta.env.VITE_APP_STAGE,
  geometryOsBaseUrl: string | undefined = import.meta.env
    .VITE_GEOMETRYOS_BASE_URL,
): AppEnvironment {
  const stage = value ?? "development";

  if (!stages.has(stage as AppStage)) {
    throw new Error(`Unsupported VITE_APP_STAGE: ${stage}`);
  }

  const geometryOsUrl = new URL(geometryOsBaseUrl ?? "http://localhost:8000");
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

  return {
    geometryOsBaseUrl: geometryOsUrl.href.replace(/\/$/, ""),
    stage: stage as AppStage,
  };
}
