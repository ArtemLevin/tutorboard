export const selectionToolId = "selection.select" as const;
export const lassoSelectionToolId = "selection.lasso" as const;

export const selectionTool = {
  capability: "board.write",
  icon: "↖",
  id: selectionToolId,
  label: "Выделение",
  shortcut: "V",
} as const;

export const lassoSelectionTool = {
  capability: "board.write",
  icon: "⌁",
  id: lassoSelectionToolId,
  label: "Лассо",
  shortcut: "L",
} as const;

export type SelectionToolId =
  | typeof lassoSelectionToolId
  | typeof selectionToolId;

export function isSelectionToolId(value: string): value is SelectionToolId {
  return value === selectionToolId || value === lassoSelectionToolId;
}
