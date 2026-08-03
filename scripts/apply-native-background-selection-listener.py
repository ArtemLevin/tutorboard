from pathlib import Path

path = Path("src/app/board-chrome/BoardToolDock.tsx")
source = path.read_text(encoding="utf-8")

import_marker = '''import {
  isDrawingToolId,
  type DrawingToolDefinition,
  type DrawingToolId,
} from "../../modules/drawing/public";
'''
selection_import = '''import {
  lassoSelectionTool,
  lassoSelectionToolId,
  selectionTool,
  selectionToolId,
} from "../../modules/selection/public";
'''
if selection_import not in source:
    if source.count(import_marker) != 1:
        raise SystemExit("Unexpected drawing import block")
    source = source.replace(import_marker, import_marker + selection_import, 1)

selection_before = '''          <ToolButton
            active={props.activeTool === "selection.pointer"}
            icon="↖"
            label="Выделение (V)"
            onClick={() => props.onActivate("selection.pointer")}
          />
          <ToolButton
            active={props.activeTool === "selection.lasso"}
            icon="⌁"
            label="Лассо (A)"
            onClick={() => props.onActivate("selection.lasso")}
          />
'''
selection_after = '''          <ToolButton
            active={props.activeTool === selectionToolId}
            icon={selectionTool.icon}
            label={`${selectionTool.label} (${selectionTool.shortcut})`}
            onClick={() => props.onActivate(selectionToolId)}
          />
          <ToolButton
            active={props.activeTool === lassoSelectionToolId}
            icon={lassoSelectionTool.icon}
            label={`${lassoSelectionTool.label} (${lassoSelectionTool.shortcut})`}
            onClick={() => props.onActivate(lassoSelectionToolId)}
          />
'''
if selection_before in source:
    source = source.replace(selection_before, selection_after, 1)
elif selection_after not in source:
    raise SystemExit("Unexpected selection tool dock block")

path.write_text(source, encoding="utf-8")

test_path = Path("tests/e2e/selection.spec.ts")
test_source = test_path.read_text(encoding="utf-8")
test_source = test_source.replace('name: "Лассо (A)"', 'name: "Лассо (L)"')
test_path.write_text(test_source, encoding="utf-8")
