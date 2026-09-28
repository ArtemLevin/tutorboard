import { drawingTools } from "../../../modules/drawing/public";
import {
  lassoSelectionToolId,
  selectionToolId,
} from "../../../modules/selection/public";
import {
  primaryStyleColors,
  type PrimaryStyleColor,
} from "../../board-chrome/color-presets";
import type { ActiveToolId } from "../active-tool";
import {
  handwrittenFunctionToolId,
  laserToolId,
  navigationToolId,
} from "../active-tool";

export type BoardShortcutId =
  | "tool.pan"
  | "tool.select"
  | "tool.lasso"
  | "tool.pen"
  | "tool.smart-ink"
  | "tool.line"
  | "tool.rectangle"
  | "tool.ellipse"
  | "tool.polygon"
  | "tool.text"
  | "tool.handwritten-function"
  | "plot.create"
  | "tool.laser"
  | "color.black"
  | "color.red"
  | "color.blue"
  | "color.green"
  | "color.yellow";

export type BoardShortcutAction =
  | {
      readonly kind: "activate-tool";
      readonly tool: ActiveToolId;
    }
  | { readonly kind: "create-plot" }
  | {
      readonly color: PrimaryStyleColor;
      readonly kind: "set-primary-color";
    };

export interface BoardShortcutInput {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
}

export interface BoardShortcutContext {
  readonly handwrittenFunctionsEnabled: boolean;
  readonly readOnly: boolean;
}

export interface BoardShortcutDefinition {
  readonly action: BoardShortcutAction;
  readonly chord: {
    readonly code: string;
    readonly shift?: boolean;
  };
  readonly id: BoardShortcutId;
  readonly label: string;
  readonly requiresWrite: boolean;
}

const shortcut = (
  id: BoardShortcutId,
  label: string,
  code: string,
  action: BoardShortcutAction,
  options: {
    readonly requiresWrite?: boolean;
    readonly shift?: boolean;
  } = {},
): BoardShortcutDefinition => ({
  action,
  chord: {
    code,
    ...(options.shift === undefined ? {} : { shift: options.shift }),
  },
  id,
  label,
  requiresWrite: options.requiresWrite ?? false,
});

const colorDefinitions = primaryStyleColors.map((color, index) =>
  shortcut(
    (
      [
        "color.black",
        "color.red",
        "color.blue",
        "color.green",
        "color.yellow",
      ] as const
    )[index]!,
    `Цвет: ${color.label}`,
    `Digit${index + 1}`,
    { color: color.value, kind: "set-primary-color" },
    { requiresWrite: true },
  ),
);

export const boardShortcuts: readonly BoardShortcutDefinition[] = [
  shortcut("tool.pan", "Перемещение", "KeyH", {
    kind: "activate-tool",
    tool: navigationToolId,
  }),
  shortcut("tool.select", "Выделение", "KeyV", {
    kind: "activate-tool",
    tool: selectionToolId,
  }),
  shortcut(
    "tool.lasso",
    "Лассо",
    "KeyV",
    { kind: "activate-tool", tool: lassoSelectionToolId },
    { shift: true },
  ),
  shortcut(
    "tool.pen",
    "Перо",
    "KeyP",
    { kind: "activate-tool", tool: "drawing.pen" },
    { requiresWrite: true },
  ),
  shortcut(
    "tool.smart-ink",
    "Smart Ink",
    "KeyI",
    { kind: "activate-tool", tool: "drawing.smart-ink" },
    { requiresWrite: true },
  ),
  shortcut(
    "tool.line",
    "Линия",
    "KeyL",
    { kind: "activate-tool", tool: "drawing.line" },
    { requiresWrite: true },
  ),
  shortcut(
    "tool.rectangle",
    "Прямоугольник",
    "KeyR",
    { kind: "activate-tool", tool: "drawing.rectangle" },
    { requiresWrite: true },
  ),
  shortcut(
    "tool.ellipse",
    "Эллипс",
    "KeyE",
    { kind: "activate-tool", tool: "drawing.ellipse" },
    { requiresWrite: true },
  ),
  shortcut(
    "tool.polygon",
    "Правильный многоугольник",
    "KeyN",
    { kind: "activate-tool", tool: "drawing.polygon" },
    { requiresWrite: true },
  ),
  shortcut(
    "tool.text",
    "Текст",
    "KeyT",
    { kind: "activate-tool", tool: "drawing.text" },
    { requiresWrite: true },
  ),
  shortcut(
    "tool.handwritten-function",
    "Рукописная функция",
    "KeyF",
    { kind: "activate-tool", tool: handwrittenFunctionToolId },
    { requiresWrite: true },
  ),
  shortcut(
    "plot.create",
    "Координатная плоскость",
    "KeyG",
    { kind: "create-plot" },
    { requiresWrite: true },
  ),
  shortcut("tool.laser", "Лазерная указка", "KeyK", {
    kind: "activate-tool",
    tool: laserToolId,
  }),
  ...colorDefinitions,
];

export function boardShortcutLabel(id: BoardShortcutId): string {
  const definition = boardShortcuts.find((candidate) => candidate.id === id);
  if (definition === undefined) return "";
  const prefix = definition.chord.shift ? "Shift+" : "";
  return `${prefix}${displayCode(definition.chord.code)}`;
}

export function boardShortcutForTool(tool: ActiveToolId): string | null {
  const definition = boardShortcuts.find(
    (candidate) =>
      candidate.action.kind === "activate-tool" &&
      candidate.action.tool === tool,
  );
  return definition === undefined ? null : boardShortcutLabel(definition.id);
}

export function resolveBoardShortcut(
  input: BoardShortcutInput,
  context: BoardShortcutContext,
): BoardShortcutAction | null {
  if (input.altKey || input.ctrlKey || input.metaKey || input.repeat) {
    return null;
  }

  const definition = boardShortcuts.find(
    (candidate) =>
      candidate.chord.code === input.code &&
      (candidate.chord.shift ?? false) === input.shiftKey,
  );
  if (definition === undefined) return null;
  if (definition.requiresWrite && context.readOnly) return null;
  if (
    definition.id === "tool.handwritten-function" &&
    !context.handwrittenFunctionsEnabled
  ) {
    return null;
  }
  if (
    definition.id === "tool.smart-ink" &&
    !drawingTools.some((tool) => tool.id === "drawing.smart-ink")
  ) {
    return null;
  }
  return definition.action;
}

function displayCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function duplicateBoardShortcutChords(): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const definition of boardShortcuts) {
    const key = `${definition.chord.shift ? "Shift+" : ""}${definition.chord.code}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}
