from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if old not in content:
        raise RuntimeError(f"Missing marker: {label}")
    return content.replace(old, new, 1)


def replace_pattern(content: str, pattern: str, replacement: str, label: str) -> str:
    next_content, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Missing pattern: {label}")
    return next_content


stage_path = "src/adapters/canvas-konva/BoardStage.tsx"
stage = read(stage_path)
stage = replace_once(stage, "  Layer,\n  Rect,", "  Layer,\n  Line,\n  Rect,", "BoardStage Line import")
stage = replace_once(
    stage,
    '''export interface SelectionPointerStartSample extends WorldPointerSample {
  readonly additive: boolean;
  readonly objectId: BoardObjectId | null;
}''',
    '''export type BoardSelectionAreaOperation = "add" | "replace" | "subtract";

export interface SelectionPointerStartSample extends WorldPointerSample {
  readonly additive: boolean;
  readonly areaOperation: BoardSelectionAreaOperation;
  readonly objectId: BoardObjectId | null;
}''',
    "selection start sample",
)
stage = replace_once(
    stage,
    '''  readonly selectionBounds?: readonly BoardSelectionBounds[];
  readonly selectionMarquee?: BoardSelectionRect | null;''',
    '''  readonly selectionBounds?: readonly BoardSelectionBounds[];
  readonly selectionLasso?: readonly Vec2[] | null;
  readonly selectionMarquee?: BoardSelectionRect | null;''',
    "selection lasso prop",
)
stage = replace_once(
    stage,
    '''  selectionBounds = [],
  selectionMarquee = null,''',
    '''  selectionBounds = [],
  selectionLasso = null,
  selectionMarquee = null,''',
    "selection lasso default",
)
stage = replace_once(
    stage,
    '''          additive: event.evt.shiftKey,
          objectId: hitObjectId,''',
    '''          additive: event.evt.shiftKey,
          areaOperation: event.evt.altKey
            ? "subtract"
            : event.evt.shiftKey
              ? "add"
              : "replace",
          objectId: hitObjectId,''',
    "selection modifiers",
)
stage = replace_once(
    stage,
    '''        : selectionModeKey !== null
          ? "default"
          : drawingModeKey === null''',
    '''        : selectionModeKey === "selection.lasso"
          ? "crosshair"
          : selectionModeKey !== null
            ? "default"
            : drawingModeKey === null''',
    "lasso cursor",
)
stage = replace_once(
    stage,
    '''      data-drawing={isDrawing}
      data-panning={isPanning}''',
    '''      data-drawing={isDrawing}
      data-lasso-points={selectionLasso?.length ?? 0}
      data-lassoing={selectionLasso !== null}
      data-panning={isPanning}''',
    "lasso data attributes",
)
stage = replace_once(
    stage,
    '''            {selectionMarquee === null ? null : (
              <Rect
                dash={[7 / previewViewport.zoom, 4 / previewViewport.zoom]}
                fill="rgba(44, 113, 130, 0.09)"
                height={selectionMarquee.height}
                stroke="#2c7182"
                strokeWidth={1.5 / previewViewport.zoom}
                width={selectionMarquee.width}
                x={selectionMarquee.x}
                y={selectionMarquee.y}
              />
            )}
            {remoteCursors.map(({ actorId, point }) => (''',
    '''            {selectionMarquee === null ? null : (
              <Rect
                dash={[7 / previewViewport.zoom, 4 / previewViewport.zoom]}
                fill="rgba(44, 113, 130, 0.09)"
                height={selectionMarquee.height}
                stroke="#2c7182"
                strokeWidth={1.5 / previewViewport.zoom}
                width={selectionMarquee.width}
                x={selectionMarquee.x}
                y={selectionMarquee.y}
              />
            )}
            {selectionLasso === null || selectionLasso.length < 2 ? null : (
              <Line
                closed={selectionLasso.length > 2}
                dash={[7 / previewViewport.zoom, 4 / previewViewport.zoom]}
                fill="rgba(44, 113, 130, 0.09)"
                lineCap="round"
                lineJoin="round"
                points={selectionLasso.flatMap(({ x, y }) => [x, y])}
                stroke="#2c7182"
                strokeWidth={1.5 / previewViewport.zoom}
              />
            )}
            {remoteCursors.map(({ actorId, point }) => (''',
    "lasso overlay",
)
write(stage_path, stage)

adapter_path = "src/adapters/canvas-konva/public.ts"
adapter = read(adapter_path)
adapter = replace_once(
    adapter,
    '''  type BoardObjectTransformSnapshot,
  type BoardSelectionBounds,''',
    '''  type BoardObjectTransformSnapshot,
  type BoardSelectionAreaOperation,
  type BoardSelectionBounds,''',
    "adapter lasso export",
)
write(adapter_path, adapter)

app_path = "src/app/App.tsx"
app = read(app_path)
app = replace_pattern(
    app,
    r'import \{\n  createDeleteSelectionCommand,[\s\S]*?\n\} from "\.\.\/modules\/selection\/public";',
    '''import {
  createDeleteSelectionCommand,
  createMoveSelectionCommand,
  createSetSelectionLockCommand,
  createTransformSelectionCommand,
  expandSelectionObjectIds,
  getSelectionLasso,
  getSelectionMarquee,
  getSelectionPreviewDelta,
  initialSelectionState,
  isSelectionToolId,
  lassoSelectionTool,
  lassoSelectionToolId,
  normalizeRect,
  reduceSelectionInteraction,
  selectionIsLocked,
  selectionTool,
  selectionToolId,
  selectObjectIdsInLasso,
  selectObjectIdsInRect,
  selectSelectionBounds,
  type CompletedSelectionMove,
  type SelectionAction,
  type SelectionState,
  type SelectionToolId,
} from "../modules/selection/public";''',
    "App selection imports",
)
app = replace_once(
    app,
    '''type ActiveToolId =
  typeof navigationToolId | typeof selectionToolId | DrawingToolId;''',
    '''type ActiveToolId = typeof navigationToolId | SelectionToolId | DrawingToolId;''',
    "active tool union",
)
app = replace_once(
    app,
    '''  const selectionMarquee = useMemo(
    () => getSelectionMarquee(selectionState),
    [selectionState],
  );
  const selectionBounds = useMemo(''',
    '''  const selectionMarquee = useMemo(
    () => getSelectionMarquee(selectionState),
    [selectionState],
  );
  const selectionLasso = useMemo(
    () => getSelectionLasso(selectionState),
    [selectionState],
  );
  const selectionBounds = useMemo(''',
    "selection lasso memo",
)
app = replace_once(
    app,
    '''  const transformableObjectIds =
    activeTool === selectionToolId &&''',
    '''  const transformableObjectIds =
    isSelectionToolId(activeTool) &&''',
    "transformable lasso selection",
)
app = replace_once(
    app,
    '''      if (event.key.toLowerCase() === selectionTool.shortcut.toLowerCase()) {
        activateTool(selectionToolId);
        return;
      }''',
    '''      if (
        event.key.toLowerCase() === lassoSelectionTool.shortcut.toLowerCase()
      ) {
        activateTool(lassoSelectionToolId);
        return;
      }
      if (event.key.toLowerCase() === selectionTool.shortcut.toLowerCase()) {
        activateTool(selectionToolId);
        return;
      }''',
    "lasso shortcut",
)
app = replace_pattern(
    app,
    r'  const startSelection = useCallback\([\s\S]*?\n  const moveSelection = useCallback\(',
    '''  const startSelection = useCallback(
    (sample: SelectionPointerStartSample) => {
      if (sample.objectId !== null && !isSelectionToolId(activeTool)) {
        activateTool(selectionToolId);
      }
      const hitObjectIds =
        sample.objectId === null
          ? []
          : expandSelectionObjectIds(document, [sample.objectId]);
      applySelectionAction({
        additive: sample.additive,
        areaKind: activeTool === lassoSelectionToolId ? "lasso" : "marquee",
        areaOperation: sample.areaOperation,
        hitObjectIds,
        kind: "start",
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [activeTool, activateTool, applySelectionAction, document],
  );

  const moveSelection = useCallback(''',
    "start selection handler",
)
app = replace_pattern(
    app,
    r'  const finishSelection = useCallback\([\s\S]*?\n  const cancelSelection = useCallback\(',
    '''  const finishSelection = useCallback(
    (sample: WorldPointerSample) => {
      const interaction = selectionStateRef.current.interaction;
      const areaObjectIds =
        interaction.kind === "marquee"
          ? expandSelectionObjectIds(
              document,
              selectObjectIdsInRect(
                scene,
                normalizeRect(interaction.start, sample.point),
              ),
            )
          : interaction.kind === "lasso"
            ? expandSelectionObjectIds(
                document,
                selectObjectIdsInLasso(scene, [
                  ...interaction.points,
                  sample.point,
                ]),
              )
            : undefined;
      applySelectionAction({
        kind: "finish",
        ...(areaObjectIds === undefined ? {} : { areaObjectIds }),
        point: sample.point,
        pointerId: sample.pointerId,
      });
      if (interaction.kind === "lasso") {
        setAccessibilityNotice(
          `Лассо завершено: выбрано ${areaObjectIds?.length ?? 0}`,
        );
      }
    },
    [applySelectionAction, document, scene],
  );

  const cancelSelection = useCallback(''',
    "finish selection handler",
)
app = replace_once(
    app,
    '''          selectionBounds={selectionBounds}
          selectionMarquee={selectionMarquee}
          selectionModeKey={
            activeTool === selectionToolId ? selectionToolId : null
          }''',
    '''          selectionBounds={selectionBounds}
          selectionLasso={selectionLasso}
          selectionMarquee={selectionMarquee}
          selectionModeKey={isSelectionToolId(activeTool) ? activeTool : null}''',
    "BoardStage lasso props",
)
selection_button = '''          <button
            aria-label={`${selectionTool.label} (${selectionTool.shortcut})`}
            aria-pressed={activeTool === selectionToolId}
            className={
              activeTool === selectionToolId
                ? "drawing-tool is-active"
                : "drawing-tool"
            }
            onClick={() => activateTool(selectionToolId)}
            title={`${selectionTool.label} · ${selectionTool.shortcut}`}
            type="button"
          >
            <span aria-hidden="true">{selectionTool.icon}</span>
          </button>'''
lasso_button = selection_button + '''
          <button
            aria-label={`${lassoSelectionTool.label} (${lassoSelectionTool.shortcut})`}
            aria-pressed={activeTool === lassoSelectionToolId}
            className={
              activeTool === lassoSelectionToolId
                ? "drawing-tool is-active"
                : "drawing-tool"
            }
            onClick={() => activateTool(lassoSelectionToolId)}
            title={`${lassoSelectionTool.label} · ${lassoSelectionTool.shortcut}`}
            type="button"
          >
            <span aria-hidden="true">{lassoSelectionTool.icon}</span>
          </button>'''
app = replace_once(app, selection_button, lasso_button, "lasso toolbar button")
app = replace_once(app, "<dt>V / H / P / I / R / E / T</dt>", "<dt>V / L / H / P / I / R / E / T</dt>", "shortcut help")
app = replace_once(
    app,
    '''              : activeTool === selectionToolId
                ? "Выделение"
                : activeTool === "drawing.smart-ink"''',
    '''              : activeTool === selectionToolId
                ? "Выделение"
                : activeTool === lassoSelectionToolId
                  ? "Лассо"
                  : activeTool === "drawing.smart-ink"''',
    "lasso help title",
)
app = replace_once(
    app,
    '''              : activeTool === selectionToolId
                ? "Клик, Shift+клик или рамка выделения"
                : activeTool === "drawing.smart-ink"''',
    '''              : activeTool === selectionToolId
                ? "Клик, Shift+клик или рамка выделения"
                : activeTool === lassoSelectionToolId
                  ? "Обведите объекты; Shift добавляет, Alt исключает"
                  : activeTool === "drawing.smart-ink"''',
    "lasso help text",
)
write(app_path, app)

e2e_path = "tests/e2e/selection.spec.ts"
e2e = read(e2e_path)
if 'test("selects selectively with a freeform lasso"' not in e2e:
    e2e += r'''

test("selects selectively with a freeform lasso", async ({ page }) => {
  await page.getByRole("button", { name: "Лассо (L)" }).click();
  await expect(page.getByRole("button", { name: "Лассо (L)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const traceLasso = async (
    points: readonly (readonly [number, number])[],
    modifier?: "Alt" | "Shift",
  ) => {
    if (modifier !== undefined) await page.keyboard.down(modifier);
    const first = await stagePoint(page, points[0]![0], points[0]![1]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) {
      const point = await stagePoint(page, x, y);
      await page.mouse.move(point.x, point.y, { steps: 3 });
    }
    await expect(page.getByTestId("board-stage")).toHaveAttribute(
      "data-lassoing",
      "true",
    );
    await page.mouse.up();
    if (modifier !== undefined) await page.keyboard.up(modifier);
    await expect(page.getByTestId("board-stage")).toHaveAttribute(
      "data-lassoing",
      "false",
    );
  };

  await traceLasso([
    [250, 150],
    [610, 150],
    [610, 340],
    [250, 340],
    [250, 150],
  ]);
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-transformable-count",
    "2",
  );

  await traceLasso(
    [
      [620, 190],
      [750, 190],
      [750, 340],
      [620, 340],
      [620, 190],
    ],
    "Shift",
  );
  await expect(page.getByTestId("selection-count")).toHaveText("3 выбрано");

  await traceLasso(
    [
      [470, 150],
      [610, 150],
      [610, 340],
      [470, 340],
      [470, 150],
    ],
    "Alt",
  );
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");

  const start = await stagePoint(page, 250, 150);
  const next = await stagePoint(page, 430, 150);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(next.x, next.y, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");
});
'''
write(e2e_path, e2e)
