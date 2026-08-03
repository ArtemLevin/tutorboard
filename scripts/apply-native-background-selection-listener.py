from pathlib import Path

path = Path("src/adapters/canvas-konva/BoardStage.tsx")
source = path.read_text(encoding="utf-8")

source = source.replace("  type PointerEvent as ReactPointerEvent,\n", "", 1)

react_fallback = '''  const handleSelectionBackgroundPointerDownCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      event.button !== 0 ||
      selectionModeKey === null ||
      panSessionRef.current !== null ||
      drawingSessionRef.current !== null ||
      selectionSessionRef.current !== null
    ) {
      return;
    }
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }
    const container = stage.container();
    const bounds = container.getBoundingClientRect();
    const hit = stage.getIntersection({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    if (hit !== null && objectIdFromTarget(hit) !== null) {
      return;
    }
    commitWheel();
    event.preventDefault();
    beginSelectionSession(event.nativeEvent, event.currentTarget, null);
  };

'''
if react_fallback in source:
    source = source.replace(react_fallback, "", 1)

source = source.replace(
    '      onPointerDownCapture={handleSelectionBackgroundPointerDownCapture}\n',
    "",
    1,
)

old_transformer_guard = '''    if (
      !isRightButton &&
      isTransformerTarget(event.target) &&
      !isLassoAreaModifier
    ) {
'''
new_transformer_guard = '''    if (
      !isRightButton &&
      transformableObjectIds.length > 0 &&
      isTransformerTarget(event.target) &&
      !isLassoAreaModifier
    ) {
'''
if old_transformer_guard in source:
    source = source.replace(old_transformer_guard, new_transformer_guard, 1)
elif new_transformer_guard not in source:
    raise SystemExit("Unexpected Transformer pointer guard")

stage_marker = '''      >
        <Layer listening={false}>
          <Group
            scaleX={previewViewport.zoom}
'''
selection_background = '''      >
        <Layer listening={selectionModeKey !== null}>
          <Rect
            fill="rgba(0, 0, 0, 0.01)"
            height={size.height}
            listening={selectionModeKey !== null}
            name="board-selection-background"
            width={size.width}
          />
        </Layer>
        <Layer listening={false}>
          <Group
            scaleX={previewViewport.zoom}
'''
if stage_marker in source:
    source = source.replace(stage_marker, selection_background, 1)
elif selection_background not in source:
    raise SystemExit("Unexpected Stage layer structure")

pointer_marker = '''  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const isRightButton = event.evt.button === 2;
'''
pointer_diagnostic = '''  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    rootRef.current?.setAttribute("data-pointer-route", "konva-received");
    rootRef.current?.setAttribute(
      "data-pointer-selection-mode",
      selectionModeKey ?? "none",
    );
    const isRightButton = event.evt.button === 2;
'''
if pointer_marker in source:
    source = source.replace(pointer_marker, pointer_diagnostic, 1)
elif pointer_diagnostic not in source:
    raise SystemExit("Unexpected pointer handler marker")

selection_start = '''      if (selectionModeKey !== null || hitObjectId !== null) {
        beginSelectionSession(event.evt, captureElement, hitObjectId);
        return;
      }
'''
selection_start_diagnostic = '''      if (selectionModeKey !== null || hitObjectId !== null) {
        rootRef.current?.setAttribute(
          "data-pointer-route",
          "selection-session-started",
        );
        beginSelectionSession(event.evt, captureElement, hitObjectId);
        return;
      }
'''
if selection_start in source:
    source = source.replace(selection_start, selection_start_diagnostic, 1)
elif selection_start_diagnostic not in source:
    raise SystemExit("Unexpected selection start branch")

path.write_text(source, encoding="utf-8")

test_path = Path("tests/e2e/selection.spec.ts")
test_source = test_path.read_text(encoding="utf-8")
move_marker = '''  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
'''
move_diagnostic = '''  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  console.log(
    "selection-route",
    await page.getByTestId("board-stage").getAttribute("data-pointer-route"),
    "selection-mode",
    await page
      .getByTestId("board-stage")
      .getAttribute("data-pointer-selection-mode"),
  );
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
'''
if move_marker in test_source:
    test_source = test_source.replace(move_marker, move_diagnostic, 1)
elif move_diagnostic not in test_source:
    raise SystemExit("Unexpected marquee diagnostic marker")
test_path.write_text(test_source, encoding="utf-8")
