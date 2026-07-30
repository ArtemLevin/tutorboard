export type SmartInkReleaseStage = "development" | "test" | "production";

const stages = new Set<SmartInkReleaseStage>([
  "development",
  "test",
  "production",
]);

export function resolveSmartInkReleaseGate(
  stageValue: string | undefined,
  flagValue: string | undefined,
): boolean {
  const stage = stageValue ?? "development";
  if (!stages.has(stage as SmartInkReleaseStage)) {
    throw new Error(`Unsupported VITE_APP_STAGE: ${stage}`);
  }
  if (flagValue === undefined || flagValue === "") {
    return stage !== "production";
  }
  if (flagValue === "true" || flagValue === "1") {
    return true;
  }
  if (flagValue === "false" || flagValue === "0") {
    return false;
  }
  throw new Error("VITE_FEATURE_SMART_INK must be true, false, 1 or 0.");
}

export function currentSmartInkReleaseGate(): boolean {
  return resolveSmartInkReleaseGate(
    import.meta.env.VITE_APP_STAGE,
    import.meta.env.VITE_FEATURE_SMART_INK,
  );
}
