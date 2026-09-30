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

export function readEraserDiameterPx(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined"
    ? null
    : window.localStorage,
): number {
  if (storage === null) return defaultEraserDiameterPx;
  try {
    const stored = storage.getItem(eraserPreferencesStorageKey);
    return normalizeEraserDiameterPx(stored === null ? null : Number(stored));
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
  storage?.setItem(eraserPreferencesStorageKey, String(normalized));
  return normalized;
}
