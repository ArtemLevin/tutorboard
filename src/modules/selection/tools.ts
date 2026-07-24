export const selectionToolId = "selection.select" as const;

export const selectionTool = {
  capability: "board.write",
  icon: "↖",
  id: selectionToolId,
  label: "Выделение",
  shortcut: "V",
} as const;
