from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}\n{old[:160]}")
    file.write_text(text.replace(old, new), encoding="utf-8")


def append_once(path: str, marker: str, addition: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if addition.strip() in text:
        return
    count = text.count(marker)
    if count != 1:
        raise RuntimeError(f"{path}: expected one marker, found {count}")
    file.write_text(text.replace(marker, marker + addition), encoding="utf-8")


# Selection command factory: snapshot-based transforms reuse core.objects.replace.
replace_once(
    "src/modules/selection/commands.ts",
    "  MoveSelectionCommand,\n  SetSelectionLockCommand,",
    "  MoveSelectionCommand,\n  ReplaceObjectsCommand,\n  SetSelectionLockCommand,",
)
replace_once(
    "src/modules/selection/commands.ts",
    "export interface ResolvedSelectionTargets {\n  readonly groupIds: readonly GroupId[];\n  readonly objectIds: readonly BoardObjectId[];\n}\n",
    "export interface ResolvedSelectionTargets {\n  readonly groupIds: readonly GroupId[];\n  readonly objectIds: readonly BoardObjectId[];\n}\n\nexport interface SelectionObjectTransform {\n  readonly objectId: BoardObjectId;\n  readonly position: Vec2;\n  readonly rotation: number;\n  readonly scale: Vec2;\n}\n",
)
append_once(
    "src/modules/selection/commands.ts",
    "export function createMoveSelectionCommand(\n",
    "",
)
replace_once(
    "src/modules/selection/commands.ts",
    "export function createSetSelectionLockCommand(\n",
    "function normalizeRotation(rotation: number): number {\n  const normalized = ((rotation + 180) % 360 + 360) % 360 - 180;\n  return Object.is(normalized, -0) ? 0 : normalized;\n}\n\nexport function createTransformSelectionCommand(\n  metadata: CommandMetadata,\n  document: BoardDocument,\n  transforms: readonly SelectionObjectTransform[],\n): ReplaceObjectsCommand {\n  if (transforms.length === 0) {\n    throw new RangeError(\"Selection transform requires at least one object.\");\n  }\n\n  const ids = transforms.map(({ objectId }) => objectId);\n  if (new Set(ids).size !== ids.length) {\n    throw new TypeError(\"Selection transform contains duplicate object IDs.\");\n  }\n\n  const originals = transforms.map(({ objectId }) => {\n    const object = document.objects[objectId];\n    if (object === undefined) {\n      throw new TypeError(`Selection transform references missing object ${objectId}.`);\n    }\n    if (object.locked || object.groupId !== null || object.source.kind !== \"user\") {\n      throw new TypeError(\n        \"Only unlocked, ungrouped user objects can be transformed.\",\n      );\n    }\n    return object;\n  });\n\n  const replacements = originals.map((object, index) => {\n    const transform = transforms[index];\n    if (\n      transform === undefined ||\n      !Number.isFinite(transform.position.x) ||\n      !Number.isFinite(transform.position.y) ||\n      !Number.isFinite(transform.rotation) ||\n      !Number.isFinite(transform.scale.x) ||\n      !Number.isFinite(transform.scale.y) ||\n      transform.scale.x <= 0 ||\n      transform.scale.y <= 0\n    ) {\n      throw new TypeError(\"Selection transform values must be finite and positive.\");\n    }\n    return {\n      ...object,\n      position: transform.position,\n      rotation: normalizeRotation(transform.rotation),\n      scale: transform.scale,\n    };\n  });\n\n  return {\n    ...metadata,\n    kind: \"core.objects.replace\",\n    originals,\n    replacements,\n  };\n}\n\nexport function createSetSelectionLockCommand(\n",
)
replace_once(
    "src/modules/selection/public.ts",
    "  createSetSelectionLockCommand,\n",
    "  createSetSelectionLockCommand,\n  createTransformSelectionCommand,\n",
)
replace_once(
    "src/modules/selection/public.ts",
    "  type ResolvedSelectionTargets,\n",
    "  type ResolvedSelectionTargets,\n  type SelectionObjectTransform,\n",
)

# Mark renderer nodes that can be attached to a Konva Transformer.
replace_once(
    "src/adapters/canvas-konva/default-renderers.tsx",
    "    opacity: object.style.opacity,\n",
    "    name: \"board-transform-target\",\n    opacity: object.style.opacity,\n",
)
replace_once(
    "src/adapters/canvas-konva/svg-renderer.tsx",
    "    height: object.size.height,\n",
    "    height: object.size.height,\n    name: \"board-transform-target\",\n",
)

# BoardStage Transformer integration.
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    'import { Circle, Group, Layer, Rect, Stage, Text } from "react-konva";',
    'import {\n  Circle,\n  Group,\n  Layer,\n  Rect,\n  Stage,\n  Text,\n  Transformer,\n} from "react-konva";',
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "export interface BoardSelectionBounds {\n  readonly id: BoardObjectId;\n  readonly rect: BoardSelectionRect;\n}\n",
    "export interface BoardSelectionBounds {\n  readonly id: BoardObjectId;\n  readonly rect: BoardSelectionRect;\n}\n\nexport interface BoardObjectTransformSnapshot {\n  readonly objectId: BoardObjectId;\n  readonly position: Vec2;\n  readonly rotation: number;\n  readonly scale: Vec2;\n}\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  readonly onSelectionPointerStart: (\n    sample: SelectionPointerStartSample,\n  ) => void;\n",
    "  readonly onSelectionPointerStart: (\n    sample: SelectionPointerStartSample,\n  ) => void;\n  readonly onSelectionTransform?: (\n    transforms: readonly BoardObjectTransformSnapshot[],\n  ) => void;\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  readonly selectionPreviewDelta?: Vec2 | null;\n  readonly onViewportCommit: (viewport: ViewportState) => void;\n",
    "  readonly selectionPreviewDelta?: Vec2 | null;\n  readonly transformableObjectIds?: readonly BoardObjectId[];\n  readonly onViewportCommit: (viewport: ViewportState) => void;\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "function objectIdFromTarget(target: Konva.Node): BoardObjectId | null {\n",
    "function isTransformerTarget(target: Konva.Node): boolean {\n  let current: Konva.Node | null = target;\n  while (current !== null) {\n    if (current.getClassName() === \"Transformer\") {\n      return true;\n    }\n    current = current.getParent();\n  }\n  return false;\n}\n\nfunction objectIdFromTarget(target: Konva.Node): BoardObjectId | null {\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  onSelectionPointerMove,\n  onSelectionPointerStart,\n  panMode,\n",
    "  onSelectionPointerMove,\n  onSelectionPointerStart,\n  onSelectionTransform,\n  panMode,\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  selectionModeKey,\n  selectionPreviewDelta = null,\n}: BoardStageProps) {\n",
    "  selectionModeKey,\n  selectionPreviewDelta = null,\n  transformableObjectIds = [],\n}: BoardStageProps) {\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  const stageRef = useRef<Konva.Stage>(null);\n",
    "  const stageRef = useRef<Konva.Stage>(null);\n  const transformerRef = useRef<Konva.Transformer>(null);\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  const [isSelecting, setIsSelecting] = useState(false);\n",
    "  const [isSelecting, setIsSelecting] = useState(false);\n  const [isTransforming, setIsTransforming] = useState(false);\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  const visibleItemBatches = useMemo(\n    () =>\n      batchBoardRenderItems(\n        selectVisibleBoardItems(scene.items, previewViewport, size),\n      ),\n    [previewViewport, scene.items, size],\n  );\n",
    "  const visibleItemBatches = useMemo(\n    () =>\n      batchBoardRenderItems(\n        selectVisibleBoardItems(scene.items, previewViewport, size),\n      ),\n    [previewViewport, scene.items, size],\n  );\n\n  useEffect(() => {\n    const stage = stageRef.current;\n    const transformer = transformerRef.current;\n    if (stage === null || transformer === null) {\n      return;\n    }\n    const allowed = new Set(transformableObjectIds);\n    const nodes = stage.find(\".board-transform-target\").filter((node) => {\n      const objectId = objectIdFromTarget(node);\n      return objectId !== null && allowed.has(objectId);\n    });\n    transformer.nodes(nodes);\n    transformer.getLayer()?.batchDraw();\n  }, [previewViewport, scene.items, transformableObjectIds]);\n\n  const finishTransform = useCallback(() => {\n    const transformer = transformerRef.current;\n    setIsTransforming(false);\n    if (transformer === null) {\n      return;\n    }\n    const transforms = transformer.nodes().flatMap((node) => {\n      const objectId = objectIdFromTarget(node);\n      const values = [\n        node.x(),\n        node.y(),\n        node.rotation(),\n        node.scaleX(),\n        node.scaleY(),\n      ];\n      if (objectId === null || values.some((value) => !Number.isFinite(value))) {\n        return [];\n      }\n      return [\n        {\n          objectId,\n          position: { x: node.x(), y: node.y() },\n          rotation: node.rotation(),\n          scale: { x: node.scaleX(), y: node.scaleY() },\n        },\n      ];\n    });\n    if (transforms.length > 0) {\n      onSelectionTransform?.(transforms);\n    }\n  }, [onSelectionTransform]);\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {\n    if (\n",
    "  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {\n    if (isTransformerTarget(event.target)) {\n      commitWheel();\n      return;\n    }\n    if (\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "  const cursor = isPanning\n    ? \"grabbing\"\n",
    "  const cursor = isPanning || isTransforming\n    ? \"grabbing\"\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "      data-selecting={isSelecting}\n",
    "      data-selecting={isSelecting}\n      data-transformable-count={transformableObjectIds.length}\n      data-transforming={isTransforming}\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "            {selectionBounds.map(({ id, rect }) => (\n",
    "            {selectionBounds\n              .filter(({ id }) => !transformableObjectIds.includes(id))\n              .map(({ id, rect }) => (\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "              />\n            ))}\n            {selectionMarquee === null ? null : (\n",
    "              />\n              ))}\n            {selectionMarquee === null ? null : (\n",
)
replace_once(
    "src/adapters/canvas-konva/BoardStage.tsx",
    "        </Layer>\n      </Stage>\n",
    "        </Layer>\n        <Layer>\n          <Group\n            scaleX={previewViewport.zoom}\n            scaleY={previewViewport.zoom}\n            x={previewViewport.offset.x}\n            y={previewViewport.offset.y}\n          >\n            <Transformer\n              ref={transformerRef}\n              anchorFill=\"#ffffff\"\n              anchorSize={9 / previewViewport.zoom}\n              anchorStroke=\"#2c7182\"\n              anchorStrokeWidth={1.5 / previewViewport.zoom}\n              borderStroke=\"#2c7182\"\n              borderStrokeWidth={1.5 / previewViewport.zoom}\n              boundBoxFunc={(oldBox, newBox) =>\n                Math.abs(newBox.width) < 8 / previewViewport.zoom ||\n                Math.abs(newBox.height) < 8 / previewViewport.zoom\n                  ? oldBox\n                  : newBox\n              }\n              enabledAnchors={[\n                \"top-left\",\n                \"top-center\",\n                \"top-right\",\n                \"middle-left\",\n                \"middle-right\",\n                \"bottom-left\",\n                \"bottom-center\",\n                \"bottom-right\",\n              ]}\n              flipEnabled={false}\n              onTransformEnd={finishTransform}\n              onTransformStart={() => setIsTransforming(true)}\n              rotateAnchorOffset={26 / previewViewport.zoom}\n              rotationSnapTolerance={5}\n              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}\n            />\n          </Group>\n        </Layer>\n      </Stage>\n",
)
replace_once(
    "src/adapters/canvas-konva/public.ts",
    "  type BoardSelectionBounds,\n",
    "  type BoardObjectTransformSnapshot,\n  type BoardSelectionBounds,\n",
)

# App composition and accessible preset controls.
replace_once(
    "src/app/App.tsx",
    "  type SelectionPointerStartSample,\n",
    "  type BoardObjectTransformSnapshot,\n  type SelectionPointerStartSample,\n",
)
replace_once(
    "src/app/App.tsx",
    "  createSetSelectionLockCommand,\n",
    "  createSetSelectionLockCommand,\n  createTransformSelectionCommand,\n",
)
replace_once(
    "src/app/App.tsx",
    "  const closeShortcuts = useCallback(() => {\n",
    "  const commitSelectionTransform = useCallback(\n    (transforms: readonly BoardObjectTransformSnapshot[]) => {\n      if (transforms.length === 0) {\n        return;\n      }\n      const current = documentRef.current;\n      let command: BoardCommand;\n      try {\n        command = createTransformSelectionCommand(\n          createCommandMetadata(),\n          current,\n          transforms,\n        );\n      } catch (error) {\n        setBoardState((latest) => ({\n          ...latest,\n          commandError:\n            error instanceof Error ? error.message : \"Transform is invalid.\",\n        }));\n        return;\n      }\n      const result = commitCommand(command);\n      if (result.ok) {\n        setAccessibilityNotice(\"Размер или поворот выделения изменён\");\n      }\n    },\n    [commitCommand, createCommandMetadata],\n  );\n\n  const transformSelectionBy = useCallback(\n    (scaleFactor: number, rotationDelta: number) => {\n      const current = documentRef.current;\n      const transforms = selectionStateRef.current.selectedObjectIds.flatMap(\n        (objectId) => {\n          const object = current.objects[objectId];\n          if (\n            object === undefined ||\n            object.locked ||\n            object.groupId !== null ||\n            object.source.kind !== \"user\"\n          ) {\n            return [];\n          }\n          return [\n            {\n              objectId,\n              position: object.position,\n              rotation: object.rotation + rotationDelta,\n              scale: {\n                x: Math.min(100, Math.max(0.05, object.scale.x * scaleFactor)),\n                y: Math.min(100, Math.max(0.05, object.scale.y * scaleFactor)),\n              },\n            },\n          ];\n        },\n      );\n      commitSelectionTransform(transforms);\n    },\n    [commitSelectionTransform],\n  );\n\n  const closeShortcuts = useCallback(() => {\n",
)
replace_once(
    "src/app/App.tsx",
    "   const canGroup =\n",
    "   const transformableObjectIds =\n    activeTool === selectionToolId &&\n    selectionState.interaction.kind === \"idle\" &&\n    selectedObjects.length > 0 &&\n    selectedObjects.every(\n      (object) =>\n        !object.locked &&\n        object.groupId === null &&\n        object.source.kind === \"user\",\n    )\n      ? selectionState.selectedObjectIds\n      : [];\n  const canGroup =\n",
)
replace_once(
    "src/app/App.tsx",
    "          onSelectionPointerStart={startSelection}\n          onViewportCommit={commitViewport}\n",
    "          onSelectionPointerStart={startSelection}\n          onSelectionTransform={commitSelectionTransform}\n          onViewportCommit={commitViewport}\n",
)
replace_once(
    "src/app/App.tsx",
    "          selectionPreviewDelta={renderedSelectionPreviewDelta}\n        />\n",
    "          selectionPreviewDelta={renderedSelectionPreviewDelta}\n          transformableObjectIds={transformableObjectIds}\n        />\n",
)
replace_once(
    "src/app/App.tsx",
    "               {selectedLocked\n                 ? \"Перемещение заблокировано\"\n                 : \"Перетащите выделение для перемещения\"}\n",
    "               {selectedLocked\n                 ? \"Трансформация заблокирована\"\n                 : transformableObjectIds.length > 0\n                   ? \"Тяните маркеры рамки для размера и поворота\"\n                   : \"Перетащите выделение для перемещения\"}\n",
)
replace_once(
    "src/app/App.tsx",
    "             <div>\n               <button\n                 onClick={() => setSelectionLock(!selectedLocked)}\n",
    "             {transformableObjectIds.length === 0 ? null : (\n               <div className=\"transform-actions\">\n                 <button\n                   aria-label=\"Уменьшить выделение на 10%\"\n                   onClick={() => transformSelectionBy(0.9, 0)}\n                   type=\"button\"\n                 >\n                   −10%\n                 </button>\n                 <button\n                   aria-label=\"Увеличить выделение на 10%\"\n                   onClick={() => transformSelectionBy(1.1, 0)}\n                   type=\"button\"\n                 >\n                   +10%\n                 </button>\n                 <button\n                   aria-label=\"Повернуть выделение на 15 градусов\"\n                   onClick={() => transformSelectionBy(1, 15)}\n                   type=\"button\"\n                 >\n                   ↻ 15°\n                 </button>\n               </div>\n             )}\n             <div>\n               <button\n                 onClick={() => setSelectionLock(!selectedLocked)}\n",
)
replace_once(
    "src/app/App.tsx",
    "        <span data-testid=\"object-count\">{document.order.length} объекта</span>\n",
    "        <span data-testid=\"first-object-transform\">\n          Масштаб: {firstObject?.scale.x ?? 1}, {firstObject?.scale.y ?? 1} · Поворот:{\" \"}\n          {firstObject?.rotation ?? 0}°\n        </span>\n        <span data-testid=\"object-count\">{document.order.length} объекта</span>\n",
)
replace_once(
    "src/app/App.tsx",
    "                 <dt>Стрелки / Shift+стрелки</dt>\n                 <dd>Перемещение выделения на 1 / 10 единиц</dd>\n",
    "                 <dt>Стрелки / Shift+стрелки</dt>\n                 <dd>Перемещение выделения на 1 / 10 единиц</dd>\n               </div>\n               <div>\n                 <dt>Маркеры рамки выделения</dt>\n                 <dd>Изменение размера и поворот</dd>\n",
)

# Styling.
replace_once(
    "src/app/styles.css",
    ".selection-inspector {\n",
    ".board-stage[data-transforming=\"true\"] {\n  user-select: none;\n}\n\n.selection-inspector {\n",
)
replace_once(
    "src/app/styles.css",
    ".layers-panel {\n",
    ".transform-actions {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 6px;\n}\n\n.transform-actions button {\n  min-height: 30px;\n  border: 1px solid #cbd4d8;\n  border-radius: 8px;\n  color: #245d6b;\n  background: #f7fbfb;\n  cursor: pointer;\n  font-weight: 700;\n}\n\n.transform-actions button:hover {\n  background: #eaf4f5;\n}\n\n.layers-panel {\n",
)

# Focused tests.
Path("src/modules/selection/transform.test.ts").write_text(
    '''import { describe, expect, it } from "vitest";\n\nimport {\n  actorId,\n  boardObjectId,\n  commandId,\n  createEmptyBoardDocument,\n  documentId,\n  reduceBoardDocument,\n  type RectangleObject,\n} from "../../core/public";\nimport { createTransformSelectionCommand } from "./commands";\n\nconst rectangle: RectangleObject = {\n  groupId: null,\n  id: boardObjectId("object:rectangle"),\n  kind: "drawing.rectangle",\n  locked: false,\n  position: { x: 20, y: 30 },\n  rotation: 0,\n  scale: { x: 1, y: 1 },\n  size: { height: 60, width: 100 },\n  source: { kind: "user" },\n  style: { fill: null, opacity: 1, stroke: "#000", strokeWidth: 2 },\n  visible: true,\n};\n\ndescribe("createTransformSelectionCommand", () => {\n  it("commits position, scale and rotation as an undoable snapshot replacement", () => {\n    const empty = createEmptyBoardDocument({\n      createdAt: "2026-07-30T12:00:00.000Z",\n      id: documentId("document:transform"),\n      title: "Transform",\n    });\n    const added = reduceBoardDocument(empty, {\n      actorId: actorId("actor:test"),\n      id: commandId("command:add"),\n      kind: "core.objects.add",\n      objects: [rectangle],\n      timestamp: "2026-07-30T12:00:01.000Z",\n    });\n    expect(added.ok).toBe(true);\n    if (!added.ok) {\n      return;\n    }\n\n    const command = createTransformSelectionCommand(\n      {\n        actorId: actorId("actor:test"),\n        id: commandId("command:transform"),\n        timestamp: "2026-07-30T12:00:02.000Z",\n      },\n      added.document,\n      [\n        {\n          objectId: rectangle.id,\n          position: { x: 70, y: 80 },\n          rotation: 375,\n          scale: { x: 1.5, y: 0.75 },\n        },\n      ],\n    );\n\n    expect(command.originals).toEqual([rectangle]);\n    expect(command.replacements[0]).toMatchObject({\n      position: { x: 70, y: 80 },\n      rotation: 15,\n      scale: { x: 1.5, y: 0.75 },\n    });\n    const transformed = reduceBoardDocument(added.document, command);\n    expect(transformed.ok).toBe(true);\n    expect(transformed.document.objects[rectangle.id]).toEqual(\n      command.replacements[0],\n    );\n  });\n\n  it("rejects locked and imported selection targets", () => {\n    const document = {\n      ...createEmptyBoardDocument({\n        createdAt: "2026-07-30T12:00:00.000Z",\n        id: documentId("document:locked"),\n        title: "Locked",\n      }),\n      objects: { [rectangle.id]: { ...rectangle, locked: true } },\n      order: [rectangle.id],\n    };\n    expect(() =>\n      createTransformSelectionCommand(\n        {\n          actorId: actorId("actor:test"),\n          id: commandId("command:locked"),\n          timestamp: "2026-07-30T12:00:01.000Z",\n        },\n        document,\n        [\n          {\n            objectId: rectangle.id,\n            position: rectangle.position,\n            rotation: 0,\n            scale: rectangle.scale,\n          },\n        ],\n      ),\n    ).toThrow("Only unlocked, ungrouped user objects");\n  });\n});\n''',
    encoding="utf-8",
)

# Append browser tests to existing suites.
with Path("tests/e2e/selection.spec.ts").open("a", encoding="utf-8") as file:
    file.write(
        '''\n\ntest("scales and rotates a selected figure with undo support", async ({ page }) => {\n  const rectangle = await stagePoint(page, 350, 250);\n  await page.mouse.click(rectangle.x, rectangle.y);\n  await expect(page.getByTestId("board-stage")).toHaveAttribute(\n    "data-transformable-count",\n    "1",\n  );\n\n  await page\n    .getByRole("button", { name: "Увеличить выделение на 10%" })\n    .click();\n  await page\n    .getByRole("button", { name: "Повернуть выделение на 15 градусов" })\n    .click();\n  await expect(page.getByTestId("first-object-transform")).toHaveText(\n    "Масштаб: 1.1, 1.1 · Поворот: 15°",\n  );\n\n  await page.keyboard.press("Control+z");\n  await expect(page.getByTestId("first-object-transform")).toHaveText(\n    "Масштаб: 1.1, 1.1 · Поворот: 0°",\n  );\n  await page.keyboard.press("Control+z");\n  await expect(page.getByTestId("first-object-transform")).toHaveText(\n    "Масштаб: 1, 1 · Поворот: 0°",\n  );\n});\n'''
    )

with Path("tests/e2e/smart-ink.spec.ts").open("a", encoding="utf-8") as file:
    file.write(
        '''\n\ntest("transforms a figure created by Smart Ink", async ({ page }) => {\n  await page.goto("/");\n  const stage = page.getByTestId("board-stage");\n  const bounds = await stage.boundingBox();\n  expect(bounds).not.toBeNull();\n  if (bounds === null) {\n    throw new Error("Canvas has no bounds.");\n  }\n\n  await page.getByRole("button", { name: "Smart Ink (I)" }).click();\n  const center = {\n    x: bounds.x + bounds.width * 0.55,\n    y: bounds.y + bounds.height * 0.45,\n  };\n  const radius = 58;\n  await page.mouse.move(center.x + radius, center.y);\n  await page.mouse.down();\n  for (let index = 1; index <= 48; index += 1) {\n    const angle = (index / 48) * Math.PI * 2;\n    await page.mouse.move(\n      center.x + Math.cos(angle) * radius,\n      center.y + Math.sin(angle) * radius,\n    );\n  }\n  await page.mouse.up();\n  await expect(page.getByText("drawing.ellipse")).toBeVisible();\n\n  await page.getByRole("button", { name: "Выделение (V)" }).click();\n  await page.mouse.click(center.x, center.y);\n  await page\n    .getByRole("button", { name: "Повернуть выделение на 15 градусов" })\n    .click();\n  await expect(page.getByTestId("first-object-transform")).toHaveText(\n    "Масштаб: 1, 1 · Поворот: 15°",\n  );\n  await page.keyboard.press("Control+z");\n  await expect(page.getByText("drawing.ellipse")).toBeVisible();\n  await expect(page.getByTestId("first-object-transform")).toHaveText(\n    "Масштаб: 1, 1 · Поворот: 0°",\n  );\n});\n'''
    )

Path("docs/architecture/OBJECT_TRANSFORMS.md").write_text(
    '''# Object transforms\n\nTutorBoard exposes resize and rotation handles for an idle selection of unlocked,\nungrouped user objects. The same path applies to native drawing objects and Smart\nInk replacements because both use the BoardDocument `position`, `rotation` and\n`scale` fields.\n\nKonva owns only the interaction preview. On transform completion the app captures\nfull original and replacement snapshots and emits `core.objects.replace`. Local\nhistory and collaborative journals therefore receive one atomic deterministic\ncommand, and undo restores the exact previous transform.\n\nImported GeometryOS objects and grouped or locked objects do not expose transform\nhandles. Their provenance and group-level semantics remain governed by their\nexisting explicit commands. The Transformer disables flips and enforces a minimum\non-screen box size. Rotation snaps to 45-degree increments within five degrees;\nfree rotation remains available outside that tolerance.\n''',
    encoding="utf-8",
)
