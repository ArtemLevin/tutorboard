import { useCallback, useState } from "react";

export const eraserPreferencesSchemaVersion =
  "tutorboard.eraser-preferences/1" as const;
export const eraserPreferencesStorageKey = eraserPreferencesSchemaVersion;
export const defaultEraserDiameterPx = 24;
export const minimumEraserDiameterPx = 8;
export const maximumEraserDiameterPx = 96;
export const eraserDiameterStepPx = 4;

export interface EraserPreferences {
  readonly diameterPx: number;
  readonly schemaVersion: typeof eraserPreferencesSchemaVersion;
}

export function normalizeEraserDiameterPx(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultEraserDiameterPx;
  }
  const clamped = Math.min(
    maximumEraserDiameterPx,
    Math.max(minimumEraserDiameterPx, value),
  );
  return (
    Math.round(clamped / eraserDiameterStepPx) * eraserDiameterStepPx
  );
}

export function readEraserPreferences(
  storage: Pick<Storage, "getItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
): EraserPreferences {
  if (storage === null) {
    return {
      diameterPx: defaultEraserDiameterPx,
      schemaVersion: eraserPreferencesSchemaVersion,
    };
  }
  try {
    const raw = storage.getItem(eraserPreferencesStorageKey);
    const parsed = raw === null ? null : (JSON.parse(raw) as unknown);
    const diameterPx =
      typeof parsed === "object" &&
      parsed !== null &&
      "diameterPx" in parsed
        ? normalizeEraserDiameterPx(
            (parsed as { readonly diameterPx?: unknown }).diameterPx,
          )
        : defaultEraserDiameterPx;
    return { diameterPx, schemaVersion: eraserPreferencesSchemaVersion };
  } catch {
    return {
      diameterPx: defaultEraserDiameterPx,
      schemaVersion: eraserPreferencesSchemaVersion,
    };
  }
}

export function writeEraserPreferences(
  preferences: EraserPreferences,
  storage: Pick<Storage, "setItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
): void {
  storage?.setItem(
    eraserPreferencesStorageKey,
    JSON.stringify({
      diameterPx: normalizeEraserDiameterPx(preferences.diameterPx),
      schemaVersion: eraserPreferencesSchemaVersion,
    }),
  );
}

export function useEraserPreferences() {
  const [preferences, setPreferences] = useState(readEraserPreferences);
  const setDiameterPx = useCallback((value: number) => {
    setPreferences((current) => {
      const next = {
        ...current,
        diameterPx: normalizeEraserDiameterPx(value),
      };
      writeEraserPreferences(next);
      return next;
    });
  }, []);
  return { diameterPx: preferences.diameterPx, setDiameterPx } as const;
}
