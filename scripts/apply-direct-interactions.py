from pathlib import Path


def replace_exact(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f"{path}: expected {count} matches, found {actual}")
    file.write_text(text.replace(old, new), encoding="utf-8")


replace_exact(
    "src/adapters/canvas-konva/BoardStage.tsx",
    'type PanSource = "hand" | "middle" | "space";',
    'type PanSource = "hand" | "middle" | "right" | "space";',
)
replace_exact(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  readonly drawingModeKey: string | null;\n",
    "  readonly drawingModeKey: string | null;\n  readonly onPanModeRequest?: () => void;\n",
)
replace_exact(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "export function BoardStage({\n  drawingModeKey,\n  onViewportCommit,",
    "export function BoardStage({\n  drawingModeKey,\n  onPanModeRequest,\n  onViewportCommit,",
)
replace_exact(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {\n    if (isTransformerTarget(event.target)) {",
    "  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {\n    const isRightButton = event.evt.button === 2;\n    if (!isRightButton && isTransformerTarget(event.target)) {",
)
replace_exact(
    "src/adapters/canvas-konva/BoardStage.tsx",
    '''    const isMiddleButton = event.evt.button === 1;
    const isLeftButton = event.evt.button === 0;
    const source: PanSource | null = isMiddleButton
      ? "middle"
      : isLeftButton && spacePressedRef.current
        ? "space"
        : isLeftButton && panMode
          ? "hand"
          : null;''',
    '''    const hitObjectId = objectIdFromTarget(event.target);
    const isMiddleButton = event.evt.button === 1;
    const isLeftButton = event.evt.button === 0;
    const shouldSelectHitObject = isLeftButton && hitObjectId !== null;
    const source: PanSource | null = isRightButton
      ? "right"
      : isMiddleButton
        ? "middle"
        : isLeftButton && spacePressedRef.current
          ? "space"
          : isLeftButton && panMode && !shouldSelectHitObject
            ? "hand"
            : null;''',
)
replace_exact(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "      if (selectionModeKey !== null) {",
    "      if (selectionModeKey !== null || hitObjectId !== null) {",
)
replace_exact(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "          objectId: objectIdFromTarget(event.target),",
    "          objectId: hitObjectId,",
)
replace_exact(
    "src/adapters/canvas-konva/BoardStage.tsx",
    '''    const viewport = previewViewport;
    panSessionRef.current = {''',
    '''    const viewport = previewViewport;
    if (source === "right") {
      onPanModeRequest?.();
    }
    panSessionRef.current = {''',
)

replace_exact(
    "src/adapters/canvas-konva/default-renderers.tsx",
    '''    name: "board-transform-target",
    opacity: object.style.opacity,''',
    '''    hitStrokeWidth: Math.max(14, object.style.strokeWidth),
    name: "board-transform-target",
    opacity: object.style.opacity,''',
)

replace_exact(
    "src/app/App.tsx",
    '''  const startSelection = useCallback(
    (sample: SelectionPointerStartSample) => {
      const hitObjectIds =''',
    '''  const startSelection = useCallback(
    (sample: SelectionPointerStartSample) => {
      if (sample.objectId !== null && activeTool !== selectionToolId) {
        activateTool(selectionToolId);
      }
      const hitObjectIds =''',
)
replace_exact(
    "src/app/App.tsx",
    "    [applySelectionAction, document],\n  );\n\n  const moveSelection",
    "    [activeTool, activateTool, applySelectionAction, document],\n  );\n\n  const moveSelection",
)
replace_exact(
    "src/app/App.tsx",
    "          onSelectionPointerCancel={cancelSelection}\n",
    "          onPanModeRequest={() => activateTool(navigationToolId)}\n          onSelectionPointerCancel={cancelSelection}\n",
)
replace_exact(
    "src/app/App.tsx",
    "          <span>Space / средняя кнопка — временное перемещение</span>",
    "          <span>Правая кнопка / Space / средняя кнопка — перемещение</span>",
)

selection_test = Path("tests/e2e/selection.spec.ts")
selection_text = selection_test.read_text(encoding="utf-8")
addition = r'''

test("selects a figure contour directly from another tool", async ({ page }) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  await expect(
    page.getByRole("button", { name: "Прямоугольник (R)" }),
  ).toHaveAttribute("aria-pressed", "true");

  const contour = await stagePoint(page, 300, 250);
  await page.mouse.click(contour.x, contour.y);

  await expect(
    page.getByRole("button", { name: "Выделение (V)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-transformable-count",
    "1",
  );
  await expect(
    page.getByRole("button", { name: "Увеличить выделение на 10%" }),
  ).toBeVisible();
});

test("right drag switches to canvas movement and pans the viewport", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const start = await stagePoint(page, 650, 430);
  const finish = await stagePoint(page, 720, 480);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-panning",
    "true",
  );
  await page.mouse.move(finish.x, finish.y, { steps: 5 });
  await page.mouse.up({ button: "right" });

  await expect(
    page.getByRole("button", { name: "Перемещение (H)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("viewport-offset")).toHaveText(
    "x 230 · y 140",
  );
  await expect(page.getByTestId("object-count")).toHaveText("3 объекта");
});
'''
if "selects a figure contour directly from another tool" in selection_text:
    raise RuntimeError("selection tests already patched")
selection_test.write_text(selection_text.rstrip() + addition + "\n", encoding="utf-8")

doc = Path("docs/architecture/OBJECT_TRANSFORMS.md")
doc_text = doc.read_text(encoding="utf-8")
doc_addition = '''

## Direct canvas gestures

- A primary-button press on a rendered object starts selection from every toolbar mode.
- Thin strokes use an expanded hit region while their visual stroke stays unchanged.
- A selected unlocked user object immediately exposes move, resize, and rotation controls.
- A secondary-button drag starts viewport panning and activates the hand tool.
- Middle-button and Space-drag viewport navigation remain available.
'''
if "## Direct canvas gestures" not in doc_text:
    doc.write_text(doc_text.rstrip() + doc_addition + "\n", encoding="utf-8")
