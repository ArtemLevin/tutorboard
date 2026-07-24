export type AppStage = "development" | "test" | "production";

export interface AppEnvironment {
  readonly stage: AppStage;
}

const stages = new Set<AppStage>(["development", "test", "production"]);

export function readEnvironment(
  value: string | undefined = import.meta.env.VITE_APP_STAGE,
): AppEnvironment {
  const stage = value ?? "development";

  if (!stages.has(stage as AppStage)) {
    throw new Error(`Unsupported VITE_APP_STAGE: ${stage}`);
  }

  return { stage: stage as AppStage };
}
