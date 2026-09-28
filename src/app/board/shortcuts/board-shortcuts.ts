export type BoardShortcutAction =
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
  | "tool.laser"
  | "plot.create"
  | "color.1"
  | "color.2"
  | "color.3"
  | "color.4"
  | "color.5";

export interface BoardShortcutBinding {
  readonly action: BoardShortcutAction;
  readonly code: string;
  readonly display: string;
  readonly requiresWrite: boolean;
  readonly shift?: boolean;
  readonly allowRepeat?: boolean;
}

export const boardShortcutBindings: readonly BoardShortcutBinding[] = [
  { action: "tool.pan", code: "KeyH", display: "H", requiresWrite: false },
  { action: "tool.select", code: "KeyV", display: "V", requiresWrite: false },
  {
    action: "tool.lasso",
    code: "KeyV",
    display: "Shift+V",
    requiresWrite: false,
    shift: true,
  },
  { action: "tool.pen", code: "KeyP", display: "P", requiresWrite: true },
  {
    action: "tool.smart-ink",
    code: "KeyI",
    display: "I",
    requiresWrite: true,
  },
  { action: "tool.line", code: "KeyL", display: "L", requiresWrite: true },
  {
    action: "tool.rectangle",
    code: "KeyR",
    display: "R",
    requiresWrite: true,
  },
  {
    action: "tool.ellipse",
    code: "KeyE",
    display: "E",
    requiresWrite: true,
  },
  {
    action: "tool.polygon",
    code: "KeyN",
    display: "N",
    requiresWrite: true,
  },
  { action: "tool.text", code: "KeyT", display: "T", requiresWrite: true },
  {
    action: "tool.handwritten-function",
    code: "KeyF",
    display: "F",
    requiresWrite: true,
  },
  { action: "tool.laser", code: "KeyK", display: "K", requiresWrite: false },
  {
    action: "plot.create",
    code: "KeyG",
    display: "G",
    requiresWrite: true,
  },
  { action: "color.1", code: "Digit1", display: "1", requiresWrite: true },
  { action: "color.2", code: "Digit2", display: "2", requiresWrite: true },
  { action: "color.3", code: "Digit3", display: "3", requiresWrite: true },
  { action: "color.4", code: "Digit4", display: "4", requiresWrite: true },
  { action: "color.5", code: "Digit5", display: "5", requiresWrite: true },
];

export interface BoardShortcutEventLike {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
  readonly shiftKey: boolean;
}

export interface ResolveBoardShortcutOptions {
  readonly readOnly: boolean;
}

export function resolveBoardShortcut(
  event: BoardShortcutEventLike,
  options: ResolveBoardShortcutOptions,
): BoardShortcutAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;

  const binding = boardShortcutBindings.find(
    (candidate) =>
      candidate.code === event.code &&
      Boolean(candidate.shift) === event.shiftKey,
  );
  if (binding === undefined) return null;
  if (event.repeat && binding.allowRepeat !== true) return null;
  if (options.readOnly && binding.requiresWrite) return null;
  return binding.action;
}

const toolActionById: Readonly<Record<string, BoardShortcutAction>> = {
  "navigation.pan": "tool.pan",
  "selection.select": "tool.select",
  "selection.lasso": "tool.lasso",
  "drawing.pen": "tool.pen",
  "drawing.smart-ink": "tool.smart-ink",
  "drawing.line": "tool.line",
  "drawing.rectangle": "tool.rectangle",
  "drawing.ellipse": "tool.ellipse",
  "drawing.polygon": "tool.polygon",
  "drawing.text": "tool.text",
  "math.handwritten-function": "tool.handwritten-function",
  "presentation.laser": "tool.laser",
};

export function shortcutLabelForTool(toolId: string): string {
  const action = toolActionById[toolId];
  return action === undefined ? "" : shortcutLabel(action);
}

export function shortcutLabel(action: BoardShortcutAction): string {
  return (
    boardShortcutBindings.find((candidate) => candidate.action === action)
      ?.display ?? ""
  );
}

export function shortcutConflicts(
  bindings: readonly BoardShortcutBinding[] = boardShortcutBindings,
): readonly string[] {
  const seen = new Set<string>();
  const conflicts: string[] = [];
  for (const binding of bindings) {
    const chord = `${binding.shift ? "Shift+" : ""}${binding.code}`;
    if (seen.has(chord)) conflicts.push(chord);
    seen.add(chord);
  }
  return conflicts;
}
