from pathlib import Path

board_stage = Path("src/adapters/canvas-konva/BoardStage.tsx")
source = board_stage.read_text(encoding="utf-8")

import_before = """  useCallback,\n  useEffect,\n  useMemo,\n"""
import_after = """  useCallback,\n  useEffect,\n  useLayoutEffect,\n  useMemo,\n"""
if source.count(import_before) != 1:
    raise SystemExit("Unexpected React import block")
source = source.replace(import_before, import_after, 1)

blocks = [
    """  useEffect(() => {\n    panModeRequestRef.current = onPanModeRequest;\n  }, [onPanModeRequest]);\n""",
    """  useEffect(() => {\n    worldPointerCallbacksRef.current = {\n      cancel: onWorldPointerCancel,\n      finish: onWorldPointerFinish,\n      move: onWorldPointerMove,\n      start: onWorldPointerStart,\n    };\n  }, [\n    onWorldPointerCancel,\n    onWorldPointerFinish,\n    onWorldPointerMove,\n    onWorldPointerStart,\n  ]);\n""",
    """  useEffect(() => {\n    selectionPointerCallbacksRef.current = {\n      cancel: onSelectionPointerCancel,\n      finish: onSelectionPointerFinish,\n      move: onSelectionPointerMove,\n      start: onSelectionPointerStart,\n    };\n  }, [\n    onSelectionPointerCancel,\n    onSelectionPointerFinish,\n    onSelectionPointerMove,\n    onSelectionPointerStart,\n  ]);\n""",
    """  useEffect(() => {\n    worldPointerHoverRef.current = onWorldPointerHover;\n  }, [onWorldPointerHover]);\n""",
    """  useEffect(() => {\n    if (drawingSessionRef.current !== null) {\n      finishDrawing(false);\n    }\n  }, [drawingModeKey, finishDrawing]);\n""",
    """  useEffect(() => {\n    if (selectionSessionRef.current !== null) {\n      finishSelection(false);\n    }\n  }, [finishSelection, selectionModeKey]);\n""",
]
for block in blocks:
    if source.count(block) != 1:
        raise SystemExit(f"Expected layout-sensitive effect once: {block.splitlines()[1]}")
    source = source.replace(block, block.replace("useEffect", "useLayoutEffect", 1), 1)

board_stage.write_text(source, encoding="utf-8")

selection_spec = Path("tests/e2e/selection.spec.ts")
test_source = selection_spec.read_text(encoding="utf-8")
needle = """  await page.mouse.move(finish.x, finish.y, { steps: 5 });\n  return { finish, start };\n"""
replacement = """  await page.mouse.move(finish.x, finish.y, { steps: 5 });\n  await expect(page.getByTestId(\"board-stage\")).toHaveAttribute(\n    \"data-selecting\",\n    \"true\",\n  );\n  return { finish, start };\n"""
if test_source.count(needle) != 1:
    raise SystemExit("Unexpected dragMarquee helper")
test_source = test_source.replace(needle, replacement, 1)
selection_spec.write_text(test_source, encoding="utf-8")
