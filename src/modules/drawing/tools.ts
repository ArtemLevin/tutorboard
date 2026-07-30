import type { ObjectStyle } from "../../core/public";

export const drawingToolIds = [
  "drawing.pen",
  "drawing.smart-ink",
  "drawing.line",
  "drawing.rectangle",
  "drawing.ellipse",
  "drawing.text",
] as const;

export type DrawingToolId = (typeof drawingToolIds)[number];

export type DrawingToolCapability = "board.write";

export interface DrawingToolDefinition {
  readonly capability: DrawingToolCapability;
  readonly icon: string;
  readonly id: DrawingToolId;
  readonly label: string;
  readonly shortcut: string;
}

export const drawingTools: readonly DrawingToolDefinition[] = [
  {
    capability: "board.write",
    icon: "✎",
    id: "drawing.pen",
    label: "Перо",
    shortcut: "P",
  },
  {
    capability: "board.write",
    icon: "✦",
    id: "drawing.smart-ink",
    label: "Smart Ink",
    shortcut: "I",
  },
  {
    capability: "board.write",
    icon: "╱",
    id: "drawing.line",
    label: "Линия",
    shortcut: "L",
  },
  {
    capability: "board.write",
    icon: "□",
    id: "drawing.rectangle",
    label: "Прямоугольник",
    shortcut: "R",
  },
  {
    capability: "board.write",
    icon: "○",
    id: "drawing.ellipse",
    label: "Эллипс",
    shortcut: "E",
  },
  {
    capability: "board.write",
    icon: "T",
    id: "drawing.text",
    label: "Текст",
    shortcut: "T",
  },
];

export const drawingStyleDefaults = {
  ellipse: {
    fill: "#dbeaed",
    opacity: 1,
    stroke: "#2c7182",
    strokeWidth: 2,
  },
  line: {
    fill: null,
    opacity: 1,
    stroke: "#245d6b",
    strokeWidth: 3,
  },
  pen: {
    fill: null,
    opacity: 1,
    stroke: "#245d6b",
    strokeWidth: 3,
  },
  smartInk: {
    fill: null,
    opacity: 1,
    stroke: "#245d6b",
    strokeWidth: 3,
  },
  rectangle: {
    fill: "#eaf1ef",
    opacity: 1,
    stroke: "#2c7182",
    strokeWidth: 2,
  },
  text: {
    fill: "#1c2a33",
    opacity: 1,
    stroke: null,
    strokeWidth: 0,
  },
} as const satisfies Readonly<Record<string, ObjectStyle>>;

export function isDrawingToolId(value: string): value is DrawingToolId {
  return drawingToolIds.includes(value as DrawingToolId);
}
