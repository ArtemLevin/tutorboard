import {
  defaultEraserDiameterPx,
  maximumEraserDiameterPx,
  minimumEraserDiameterPx,
} from "./geometry";

export const eraserPreferencesStorageKey = "tutorboard.eraser-preferences/1";

export function normalizeEraserDiameterPx(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultEraserDiameterPx;
  }
  return Math.min(
    maximumEraserDiameterPx,
    Math.max(minimumEraserDiameterPx, Math.round(value / 4) * 4),
  );
}

function readStoredDiameter(value: string): number {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      "diameterPx" in parsed
    ) {
      return normalizeEraserDiameterPx(
        (parsed as { readonly diameterPx?: unknown }).diameterPx,
      );
    }
    return normalizeEraserDiameterPx(parsed);
  } catch {
    return normalizeEraserDiameterPx(Number(value));
  }
}

export function readEraserDiameterPx(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined"
    ? null
    : window.localStorage,
): number {
  if (storage === null) return defaultEraserDiameterPx;
  try {
    const stored = storage.getItem(eraserPreferencesStorageKey);
    return stored === null ? defaultEraserDiameterPx : readStoredDiameter(stored);
  } catch {
    return defaultEraserDiameterPx;
  }
}

export function writeEraserDiameterPx(
  value: number,
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined"
    ? null
    : window.localStorage,
): number {
  const normalized = normalizeEraserDiameterPx(value);
  try {
    storage?.setItem(
      eraserPreferencesStorageKey,
      JSON.stringify({ diameterPx: normalized }),
    );
  } catch {
    // Browser storage is optional; callers keep the normalized in-memory value.
  }
  return normalized;
}
