import { useCallback, useState } from "react";

import type { ObjectStyle } from "../../core/public";
import {
  defaultDrawingToolStyle,
  normalizeDrawingToolStyle,
} from "./tool-preferences";

export const quickToolPreferencesSchemaVersion =
  "tutorboard.quick-tools/1" as const;
export const quickToolPreferencesStorageKey = quickToolPreferencesSchemaVersion;
export const maxFavoriteTools = 5;

export const availableFavoriteTools = [
  { id: "drawing.pen", icon: "✎", label: "Перо", requiresWrite: true },
  {
    id: "drawing.smart-ink",
    icon: "✦",
    label: "Smart Ink",
    requiresWrite: true,
  },
  { id: "drawing.line", icon: "╱", label: "Линия", requiresWrite: true },
  {
    id: "drawing.rectangle",
    icon: "▭",
    label: "Прямоугольник",
    requiresWrite: true,
  },
  { id: "drawing.ellipse", icon: "◯", label: "Эллипс", requiresWrite: true },
  {
    id: "drawing.polygon",
    icon: "⬡",
    label: "Многоугольник",
    requiresWrite: true,
  },
  { id: "drawing.text", icon: "T", label: "Текст", requiresWrite: true },
  { id: "editing.eraser", icon: "⌫", label: "Ластик", requiresWrite: true },
  { id: "navigation.pan", icon: "✋", label: "Рука", requiresWrite: false },
  {
    id: "selection.select",
    icon: "⌖",
    label: "Выделение",
    requiresWrite: false,
  },
  { id: "presentation.laser", icon: "●", label: "Лазер", requiresWrite: false },
] as const;

export type FavoriteToolId = (typeof availableFavoriteTools)[number]["id"];
export type PenPresetSlot = 0 | 1;
type PenPresetPair = readonly [ObjectStyle, ObjectStyle];

export interface QuickToolPreferences {
  readonly schemaVersion: typeof quickToolPreferencesSchemaVersion;
  readonly favorites: readonly FavoriteToolId[];
  readonly penPresets: PenPresetPair;
  readonly lastSelectedSlot: PenPresetSlot;
}

const knownFavoriteTools: ReadonlySet<string> = new Set(
  availableFavoriteTools.map(({ id }) => id),
);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultPenPresets(): PenPresetPair {
  const pen = defaultDrawingToolStyle("drawing.pen");
  return [pen, { ...pen, stroke: "#2563eb", strokeWidth: 6 }];
}

export function normalizeQuickToolPreferences(
  value: unknown,
): QuickToolPreferences {
  const record = isRecord(value) ? value : {};
  const defaults = defaultPenPresets();
  const favorites: FavoriteToolId[] = [];
  const source = Array.isArray(record.favorites)
    ? record.favorites
    : ["drawing.pen", "editing.eraser", "drawing.line"];
  for (const id of source) {
    if (
      typeof id === "string" &&
      knownFavoriteTools.has(id) &&
      !favorites.includes(id as FavoriteToolId)
    ) {
      favorites.push(id as FavoriteToolId);
      if (favorites.length === maxFavoriteTools) break;
    }
  }
  const slots = Array.isArray(record.penPresets) ? record.penPresets : [];
  return {
    schemaVersion: quickToolPreferencesSchemaVersion,
    favorites,
    penPresets: [
      normalizeDrawingToolStyle("drawing.pen", slots[0] ?? defaults[0]),
      normalizeDrawingToolStyle("drawing.pen", slots[1] ?? defaults[1]),
    ],
    lastSelectedSlot: record.lastSelectedSlot === 1 ? 1 : 0,
  };
}

export function readQuickToolPreferences(
  storage: Pick<Storage, "getItem"> | null = safeLocalStorage(),
): QuickToolPreferences {
  if (storage === null) return normalizeQuickToolPreferences(null);
  try {
    const stored = storage.getItem(quickToolPreferencesStorageKey);
    return normalizeQuickToolPreferences(
      stored === null ? null : JSON.parse(stored),
    );
  } catch {
    return normalizeQuickToolPreferences(null);
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function writeQuickToolPreferences(
  preferences: QuickToolPreferences,
  storage: Pick<Storage, "setItem"> | null = safeLocalStorage(),
): void {
  try {
    storage?.setItem(
      quickToolPreferencesStorageKey,
      JSON.stringify(normalizeQuickToolPreferences(preferences)),
    );
  } catch {
    // Storage may be blocked, unavailable or at quota. In-memory UX remains usable.
  }
}

export function penPresetMatchesStyle(
  preset: ObjectStyle,
  style: ObjectStyle,
): boolean {
  return (
    preset.stroke === style.stroke &&
    preset.strokeWidth === style.strokeWidth &&
    preset.strokeStyle === style.strokeStyle &&
    preset.opacity === style.opacity &&
    preset.fill === style.fill
  );
}

export function useQuickToolPreferences() {
  const [preferences, setPreferences] = useState(readQuickToolPreferences);

  const updatePreferences = useCallback(
    (makeNext: (current: QuickToolPreferences) => QuickToolPreferences) => {
      setPreferences((current) => {
        const next = normalizeQuickToolPreferences(makeNext(current));
        writeQuickToolPreferences(next);
        return next;
      });
    },
    [],
  );

  const toggleFavorite = useCallback(
    (tool: FavoriteToolId) => {
      updatePreferences((current) => {
        const favorites = current.favorites.includes(tool)
          ? current.favorites.filter((id) => id !== tool)
          : current.favorites.length >= maxFavoriteTools
            ? current.favorites
            : [...current.favorites, tool];
        return { ...current, favorites };
      });
    },
    [updatePreferences],
  );

  const savePenPreset = useCallback(
    (slot: PenPresetSlot, style: ObjectStyle) => {
      updatePreferences((current) => ({
        ...current,
        penPresets:
          slot === 0
            ? [
                normalizeDrawingToolStyle("drawing.pen", style),
                current.penPresets[1],
              ]
            : [
                current.penPresets[0],
                normalizeDrawingToolStyle("drawing.pen", style),
              ],
        lastSelectedSlot: slot,
      }));
    },
    [updatePreferences],
  );

  const selectPenPreset = useCallback(
    (slot: PenPresetSlot) => {
      updatePreferences((current) => ({
        ...current,
        lastSelectedSlot: slot,
      }));
    },
    [updatePreferences],
  );

  return {
    ...preferences,
    toggleFavorite,
    savePenPreset,
    selectPenPreset,
  } as const;
}

export type QuickToolController = ReturnType<typeof useQuickToolPreferences>;
