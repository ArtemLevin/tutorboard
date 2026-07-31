import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content);
}

function replaceOnce(content, oldValue, newValue, label) {
  if (!content.includes(oldValue)) {
    throw new Error(`Missing marker: ${label}`);
  }
  return content.replace(oldValue, newValue);
}

function replacePattern(content, pattern, replacement, label) {
  const next = content.replace(pattern, replacement);
  if (next === content) {
    throw new Error(`Missing pattern: ${label}`);
  }
  return next;
}

const stagePath = "src/adapters/canvas-konva/BoardStage.tsx";
let stage = read(stagePath);
stage = replaceOnce(
  stage,
  '  Layer,\n  Rect,',
  '  Layer,\n  Line,\n  Rect,',
  "BoardStage Line import",
);
stage = replaceOnce(
  stage,
  'export interface SelectionPointerStartSample extends WorldPointerSample {\n  readonly additive: boolean;\n  readonly objectId: BoardObjectId | null;\n}',
  'export type BoardSelectionAreaOperation = "add" | "replace" | "subtract";\n\nexport interface SelectionPointerStartSample extends WorldPointerSample {\n  readonly additive: boolean;\n  readonly areaOperation: BoardSelectionAreaOperation;\n  readonly objectId: BoardObjectId | null;\n}',
  "selection start sample",
);
stage = replaceOnce(
  stage,
  '  readonly selectionBounds?: readonly BoardSelectionBounds[];\n  readonly selectionMarquee?: BoardSelectionRect | null;',
  '  readonly selectionBounds?: readonly BoardSelectionBounds[];\n  readonly selectionLasso?: readonly Vec2[] | null;\n  readonly selectionMarquee?: BoardSelectionRect | null;',
  "selection lasso prop",
);
stage = replaceOnce(
  stage,
  '  selectionBounds = [],\n  selectionMarquee = null,',
  '  selectionBounds = [],\n  selectionLasso = null,\n  selectionMarquee = null,',
  "selection lasso default",
);
stage = replaceOnce(
  stage,
  '          additive: event.evt.shiftKey,\n          objectId: hitObjectId,',
  '          additive: event.evt.shiftKey,\n          areaOperation: event.evt.altKey\n            ? "subtract"\n            : event.evt.shiftKey\n              ? "add"\n              : "replace",\n          objectId: hitObjectId,',
  "selection modifiers",
);
stage = replaceOnce(
  stage,
  '        : selectionModeKey !== null\n          ? "default"\n          : drawingModeKey === null',
  '        : selectionModeKey === "selection.lasso"\n          ? "crosshair"\n          : selectionModeKey !== null\n            ? "default"\n            : drawingModeKey === null',
  "lasso cursor",
);
stage = replaceOnce(
  stage,
  '      data-drawing={isDrawing}\n      data-panning={isPanning}',
  '      data-drawing={isDrawing}\n      data-lasso-points={selectionLasso?.length ?? 0}\n      data-lassoing={selectionLasso !== null}\n      data-panning={isPanning}',
  "lasso data attributes",
);
stage = replaceOnce(
  stage,
  '            {selectionMarquee === null ? null : (\n              <Rect\n                dash={[7 / previewViewport.zoom, 4 / previewViewport.zoom]}\n                fill="rgba(44, 113, 130, 0.09)"\n                height={selectionMarquee.height}\n                stroke="#2c7182"\n                strokeWidth={1.5 / previewViewport.zoom}\n                width={selectionMarquee.width}\n                x={selectionMarquee.x}\n                y={selectionMarquee.y}\n              />\n            )}\n            {remoteCursors.map(({ actorId, point }) => (',
  '            {selectionMarquee === null ? null : (\n              <Rect\n                dash={[7 / previewViewport.zoom, 4 / previewViewport.zoom]}\n                fill="rgba(44, 113, 130, 0.09)"\n                height={selectionMarquee.height}\n                stroke="#2c7182"\n                strokeWidth={1.5 / previewViewport.zoom}\n                width={selectionMarquee.width}\n                x={selectionMarquee.x}\n                y={selectionMarquee.y}\n              />\n            )}\n            {selectionLasso === null || selectionLasso.length < 2 ? null : (\n              <Line\n                closed={selectionLasso.length > 2}\n                dash={[7 / previewViewport.zoom, 4 / previewViewport.zoom]}\n                fill="rgba(44, 113, 130, 0.09)"\n                lineCap="round"\n                lineJoin="round"\n                points={selectionLasso.flatMap(({ x, y }) => [x, y])}\n                stroke="#2c7182"\n                strokeWidth={1.5 / previewViewport.zoom}\n              />\n            )}\n            {remoteCursors.map(({ actorId, point }) => (',
  "lasso overlay",
);
write(stagePath, stage);

const adapterPublicPath = "src/adapters/canvas-konva/public.ts";
let adapterPublic = read(adapterPublicPath);
adapterPublic = replaceOnce(
  adapterPublic,
  '  type BoardObjectTransformSnapshot,\n  type BoardSelectionBounds,',
  '  type BoardObjectTransformSnapshot,\n  type BoardSelectionAreaOperation,\n  type BoardSelectionBounds,',
  "adapter lasso type export",
);
write(adapterPublicPath, adapterPublic);

const appPath = "src/app/App.tsx";
let app = read(appPath);
app = replacePattern(
  app,
  /import \{\n  createDeleteSelectionCommand,[\s\S]*?\n\} from "\.\.\/modules\/selection\/public";/u,
  `import {
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
} from "../modules/selection/public";`,
  "App selection imports",
);
app = replaceOnce(
  app,
  'type ActiveToolId =\n  typeof navigationToolId | typeof selectionToolId | DrawingToolId;',
  'type ActiveToolId = typeof navigationToolId | SelectionToolId | DrawingToolId;',
  "active tool union",
);
app = replaceOnce(
  app,
  '  const selectionMarquee = useMemo(\n    () => getSelectionMarquee(selectionState),\n    [selectionState],\n  );\n  const selectionBounds = useMemo(',
  '  const selectionMarquee = useMemo(\n    () => getSelectionMarquee(selectionState),\n    [selectionState],\n  );\n  const selectionLasso = useMemo(\n    () => getSelectionLasso(selectionState),\n    [selectionState],\n  );\n  const selectionBounds = useMemo(',
  "selection lasso memo",
);
app = replaceOnce(
  app,
  '  const transformableObjectIds =\n    activeTool === selectionToolId &&',
  '  const transformableObjectIds =\n    isSelectionToolId(activeTool) &&',
  "transformable lasso selection",
);
app = replaceOnce(
  app,
  '      if (event.key.toLowerCase() === selectionTool.shortcut.toLowerCase()) {\n        activateTool(selectionToolId);\n        return;\n      }',
  '      if (\n        event.key.toLowerCase() === lassoSelectionTool.shortcut.toLowerCase()\n      ) {\n        activateTool(lassoSelectionToolId);\n        return;\n      }\n      if (event.key.toLowerCase() === selectionTool.shortcut.toLowerCase()) {\n        activateTool(selectionToolId);\n        return;\n      }',
  "lasso shortcut",
);
app = replacePattern(
  app,
  /  const startSelection = useCallback\([\s\S]*?\n  const moveSelection = useCallback\(/u,
  `  const startSelection = useCallback(
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

  const moveSelection = useCallback(`,
  "start selection handler",
);
app = replacePattern(
  app,
  /  const finishSelection = useCallback\([\s\S]*?\n  const cancelSelection = useCallback\(/u,
  `  const finishSelection = useCallback(
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
          \`Лассо завершено: выбрано \${areaObjectIds?.length ?? 0}\`,
        );
      }
    },
    [applySelectionAction, document, scene],
  );

  const cancelSelection = useCallback(`,
  "finish selection handler",
);
app = replaceOnce(
  app,
  '          selectionBounds={selectionBounds}\n          selectionMarquee={selectionMarquee}\n          selectionModeKey={\n            activeTool === selectionToolId ? selectionToolId : null\n          }',
  '          selectionBounds={selectionBounds}\n          selectionLasso={selectionLasso}\n          selectionMarquee={selectionMarquee}\n          selectionModeKey={isSelectionToolId(activeTool) ? activeTool : null}',
  "BoardStage lasso props",
);
const selectionButton = `          <button
            aria-label={\\`\${selectionTool.label} (\${selectionTool.shortcut})\\`}
            aria-pressed={activeTool === selectionToolId}
            className={
              activeTool === selectionToolId
                ? "drawing-tool is-active"
                : "drawing-tool"
            }
            onClick={() => activateTool(selectionToolId)}
            title={\\`\${selectionTool.label} · \${selectionTool.shortcut}\\`}
            type="button"
          >
            <span aria-hidden="true">{selectionTool.icon}</span>
          </button>`;
const lassoButton = `${selectionButton}
          <button
            aria-label={\\`\${lassoSelectionTool.label} (\${lassoSelectionTool.shortcut})\\`}
            aria-pressed={activeTool === lassoSelectionToolId}
            className={
              activeTool === lassoSelectionToolId
                ? "drawing-tool is-active"
                : "drawing-tool"
            }
            onClick={() => activateTool(lassoSelectionToolId)}
            title={\\`\${lassoSelectionTool.label} · \${lassoSelectionTool.shortcut}\\`}
            type="button"
          >
            <span aria-hidden="true">{lassoSelectionTool.icon}</span>
          </button>`;
app = replaceOnce(app, selectionButton, lassoButton, "lasso toolbar button");
app = replaceOnce(
  app,
  '<dt>V / H / P / I / R / E / T</dt>',
  '<dt>V / L / H / P / I / R / E / T</dt>',
  "shortcut help",
);
app = replaceOnce(
  app,
  '              : activeTool === selectionToolId\n                ? "Выделение"\n                : activeTool === "drawing.smart-ink"',
  '              : activeTool === selectionToolId\n                ? "Выделение"\n                : activeTool === lassoSelectionToolId\n                  ? "Лассо"\n                  : activeTool === "drawing.smart-ink"',
  "lasso help title",
);
app = replaceOnce(
  app,
  '              : activeTool === selectionToolId\n                ? "Клик, Shift+клик или рамка выделения"\n                : activeTool === "drawing.smart-ink"',
  '              : activeTool === selectionToolId\n                ? "Клик, Shift+клик или рамка выделения"\n                : activeTool === lassoSelectionToolId\n                  ? "Обведите объекты; Shift добавляет, Alt исключает"\n                  : activeTool === "drawing.smart-ink"',
  "lasso help text",
);
write(appPath, app);

const e2ePath = "tests/e2e/selection.spec.ts";
let e2e = read(e2ePath);
if (!e2e.includes('test("selects selectively with a freeform lasso"')) {
  e2e += `

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
`;
}
write(e2ePath, e2e);
