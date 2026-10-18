import { useCallback, useState } from "react";

import {
  strokeStyles,
  type ObjectStyle,
  type StrokeStyle,
} from "../../core/public";
import {
  drawingStyleDefaults,
  type DrawingToolId,
} from "../../modules/drawing/public";

export const drawingToolPreferencesSchemaVersion =
  "tutorboard.tool-preferences/1" as const;
export const drawingToolPreferencesStorageKey =
  drawingToolPreferencesSchemaVersion;

export interface DrawingToolPreferences {
  readonly schemaVersion: typeof drawingToolPreferencesSchemaVersion;
  readonly tools: Readonly<Partial<Record<DrawingToolId, ObjectStyle>>>;
}

const supportedStrokeStyles = new Set<StrokeStyle>(strokeStyles);
const hexColor = /^#[0-9a-f]{6}$/iu;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function color(value: unknown, fallback: string | null): string | null {
  if (value === null && fallback === null) return null;
  return typeof value === "string" && hexColor.test(value) ? value : fallback;
}

function finiteRange(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

export function defaultDrawingToolStyle(tool: DrawingToolId): ObjectStyle {
  switch (tool) {
    case "drawing.pen":
      return { ...drawingStyleDefaults.pen, strokeStyle: "hand-pen" };
    case "drawing.smart-ink":
      return { ...drawingStyleDefaults.smartInk, strokeStyle: "hand-pen" };
    case "drawing.line":
      return { ...drawingStyleDefaults.line, strokeStyle: "thin" };
    case "drawing.rectangle":
      return { ...drawingStyleDefaults.rectangle, strokeStyle: "thin" };
    case "drawing.ellipse":
      return { ...drawingStyleDefaults.ellipse, strokeStyle: "thin" };
    case "drawing.polygon":
      return { ...drawingStyleDefaults.polygon, strokeStyle: "thin" };
    case "drawing.text":
      return {
        ...drawingStyleDefaults.text,
        fontSize: 22,
        lineHeight: 1.35,
        fontFamily: "sans",
        fontWeight: "normal",
        fontStyle: "normal",
      };
  }
}

export function normalizeDrawingToolStyle(
  tool: DrawingToolId,
  value: unknown,
): ObjectStyle {
  const fallback = defaultDrawingToolStyle(tool);
  if (!isRecord(value)) return fallback;
  const candidateStrokeStyle = value.strokeStyle;
  const strokeStyle =
    typeof candidateStrokeStyle === "string" &&
    supportedStrokeStyles.has(candidateStrokeStyle as StrokeStyle)
      ? (candidateStrokeStyle as StrokeStyle)
      : fallback.strokeStyle;
  return {
    fill: color(value.fill, fallback.fill),
    opacity: finiteRange(value.opacity, 0, 1, fallback.opacity),
    stroke: color(value.stroke, fallback.stroke),
    strokeWidth: finiteRange(value.strokeWidth, 0, 64, fallback.strokeWidth),
    ...(strokeStyle === undefined ? {} : { strokeStyle }),
    ...(tool === "drawing.text"
      ? {
          fontSize: finiteRange(value.fontSize, 8, 96, fallback.fontSize ?? 22),
          lineHeight: finiteRange(
            value.lineHeight,
            0.8,
            2.5,
            fallback.lineHeight ?? 1.35,
          ),
          fontFamily:
            value.fontFamily === "serif" || value.fontFamily === "mono"
              ? value.fontFamily
              : "sans",
          fontWeight: value.fontWeight === "bold" ? "bold" : "normal",
          fontStyle: value.fontStyle === "italic" ? "italic" : "normal",
        }
      : {}),
  };
}

export function normalizeDrawingToolPreferences(
  value: unknown,
): DrawingToolPreferences {
  const record = isRecord(value) ? value : {};
  const tools = isRecord(record.tools) ? record.tools : {};
  return {
    schemaVersion: drawingToolPreferencesSchemaVersion,
    tools: {
      "drawing.pen": normalizeDrawingToolStyle(
        "drawing.pen",
        tools["drawing.pen"],
      ),
      "drawing.smart-ink": normalizeDrawingToolStyle(
        "drawing.smart-ink",
        tools["drawing.smart-ink"],
      ),
      "drawing.line": normalizeDrawingToolStyle(
        "drawing.line",
        tools["drawing.line"],
      ),
      "drawing.rectangle": normalizeDrawingToolStyle(
        "drawing.rectangle",
        tools["drawing.rectangle"],
      ),
      "drawing.ellipse": normalizeDrawingToolStyle(
        "drawing.ellipse",
        tools["drawing.ellipse"],
      ),
      "drawing.polygon": normalizeDrawingToolStyle(
        "drawing.polygon",
        tools["drawing.polygon"],
      ),
      "drawing.text": normalizeDrawingToolStyle(
        "drawing.text",
        tools["drawing.text"],
      ),
    },
  };
}

export function readDrawingToolPreferences(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined"
    ? null
    : window.localStorage,
): DrawingToolPreferences {
  if (storage === null) return normalizeDrawingToolPreferences(null);
  try {
    const stored = storage.getItem(drawingToolPreferencesStorageKey);
    return normalizeDrawingToolPreferences(
      stored === null ? null : JSON.parse(stored),
    );
  } catch {
    return normalizeDrawingToolPreferences(null);
  }
}

export function writeDrawingToolPreferences(
  preferences: DrawingToolPreferences,
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined"
    ? null
    : window.localStorage,
): void {
  storage?.setItem(
    drawingToolPreferencesStorageKey,
    JSON.stringify(normalizeDrawingToolPreferences(preferences)),
  );
}

export function useDrawingToolPreferences() {
  const [preferences, setPreferences] = useState(readDrawingToolPreferences);
  const styleFor = useCallback(
    (tool: DrawingToolId): ObjectStyle =>
      preferences.tools[tool] ?? defaultDrawingToolStyle(tool),
    [preferences],
  );
  const updateStyle = useCallback(
    (tool: DrawingToolId, patch: Partial<ObjectStyle>) => {
      setPreferences((current) => {
        const next = normalizeDrawingToolPreferences({
          ...current,
          tools: {
            ...current.tools,
            [tool]: { ...current.tools[tool], ...patch },
          },
        });
        writeDrawingToolPreferences(next);
        return next;
      });
    },
    [],
  );
  return { preferences, styleFor, updateStyle } as const;
}
