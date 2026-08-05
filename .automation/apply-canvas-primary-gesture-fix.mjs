import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

const boardPath = "src/adapters/canvas-konva/BoardStage.tsx";
let board = readFileSync(boardPath, "utf8");

board = replaceOnce(
  board,
  "const canvasPrimaryClickDelayMs = 280;",
  "const canvasPrimaryClickDelayMs = 500;",
  "primary click delay",
);

board = replaceOnce(
  board,
  `interface RightClickCandidate {`,
  `interface PrimaryCanvasPointerCandidate {\n  readonly pointerId: number;\n  readonly startPoint: Vec2;\n}\n\ninterface RightClickCandidate {`,
  "primary pointer candidate interface",
);

board = replaceOnce(
  board,
  `  const primaryCanvasClickTimeoutRef = useRef<number | null>(null);\n  const primaryCanvasClickCandidateRef = useRef<{`,
  `  const primaryCanvasClickTimeoutRef = useRef<number | null>(null);\n  const primaryCanvasPointerCandidateRef =\n    useRef<PrimaryCanvasPointerCandidate | null>(null);\n  const primaryCanvasClickCandidateRef = useRef<{`,
  "primary pointer candidate ref",
);

board = replaceOnce(
  board,
  `  const commitWheel = useCallback(() => {\n    const session = wheelSessionRef.current;\n    if (session !== null) {\n      window.clearTimeout(session.timeoutId);\n      wheelSessionRef.current = null;\n      setPreviewViewport(session.latestViewport);\n      onViewportCommit(session.latestViewport);\n    }\n  }, [onViewportCommit]);\n\n  useLayoutEffect(() => {`,
  `  const commitWheel = useCallback(() => {\n    const session = wheelSessionRef.current;\n    if (session !== null) {\n      window.clearTimeout(session.timeoutId);\n      wheelSessionRef.current = null;\n      setPreviewViewport(session.latestViewport);\n      onViewportCommit(session.latestViewport);\n    }\n  }, [onViewportCommit]);\n\n  const clearPendingPrimaryCanvasTap = useCallback(() => {\n    primaryCanvasClickCandidateRef.current = null;\n    if (primaryCanvasClickTimeoutRef.current !== null) {\n      window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n      primaryCanvasClickTimeoutRef.current = null;\n    }\n  }, []);\n\n  const registerPrimaryCanvasTap = useCallback(\n    (event: PointerEvent) => {\n      const point = clientPoint(event);\n      const previous = primaryCanvasClickCandidateRef.current;\n      const elapsed =\n        previous === null\n          ? Number.POSITIVE_INFINITY\n          : event.timeStamp - previous.timestamp;\n      const withinDistance =\n        previous !== null &&\n        Math.hypot(\n          point.x - previous.point.x,\n          point.y - previous.point.y,\n        ) <= rightDoubleClickDistancePx;\n\n      if (\n        previous !== null &&\n        elapsed >= 0 &&\n        elapsed <= canvasPrimaryClickDelayMs &&\n        withinDistance\n      ) {\n        clearPendingPrimaryCanvasTap();\n        onCanvasPrimaryDoubleClickRequest?.();\n        return;\n      }\n\n      clearPendingPrimaryCanvasTap();\n      primaryCanvasClickCandidateRef.current = {\n        point,\n        timestamp: event.timeStamp,\n      };\n      primaryCanvasClickTimeoutRef.current = window.setTimeout(() => {\n        primaryCanvasClickTimeoutRef.current = null;\n        primaryCanvasClickCandidateRef.current = null;\n        onCanvasPrimaryClickRequest?.();\n      }, canvasPrimaryClickDelayMs);\n    },\n    [\n      clearPendingPrimaryCanvasTap,\n      onCanvasPrimaryClickRequest,\n      onCanvasPrimaryDoubleClickRequest,\n    ],\n  );\n\n  useLayoutEffect(() => {`,
  "primary tap helpers",
);

board = replaceOnce(
  board,
  `      const drawingSession = drawingSessionRef.current;\n      if (`,
  `      const primaryCanvasPointerCandidate =\n        primaryCanvasPointerCandidateRef.current;\n      if (\n        primaryCanvasPointerCandidate !== null &&\n        primaryCanvasPointerCandidate.pointerId === event.pointerId &&\n        Math.hypot(\n          event.clientX - primaryCanvasPointerCandidate.startPoint.x,\n          event.clientY - primaryCanvasPointerCandidate.startPoint.y,\n        ) > rightDoubleClickDistancePx\n      ) {\n        primaryCanvasPointerCandidateRef.current = null;\n        clearPendingPrimaryCanvasTap();\n      }\n\n      const drawingSession = drawingSessionRef.current;\n      if (`,
  "pointer move arbitration",
);

board = replaceOnce(
  board,
  `    const handlePointerUp = (event: PointerEvent) => {\n      if (drawingSessionRef.current?.pointerId === event.pointerId) {`,
  `    const handlePointerUp = (event: PointerEvent) => {\n      const primaryCanvasPointerCandidate =\n        primaryCanvasPointerCandidateRef.current;\n      if (\n        primaryCanvasPointerCandidate !== null &&\n        primaryCanvasPointerCandidate.pointerId === event.pointerId\n      ) {\n        primaryCanvasPointerCandidateRef.current = null;\n        const stationary =\n          Math.hypot(\n            event.clientX - primaryCanvasPointerCandidate.startPoint.x,\n            event.clientY - primaryCanvasPointerCandidate.startPoint.y,\n          ) <= rightDoubleClickDistancePx;\n        if (stationary) {\n          event.preventDefault();\n          if (drawingSessionRef.current?.pointerId === event.pointerId) {\n            finishDrawing(false);\n          } else if (\n            selectionSessionRef.current?.pointerId === event.pointerId\n          ) {\n            finishSelection(false);\n          } else if (panSessionRef.current?.pointerId === event.pointerId) {\n            finishPan(false);\n          }\n          registerPrimaryCanvasTap(event);\n          return;\n        }\n      }\n      if (drawingSessionRef.current?.pointerId === event.pointerId) {`,
  "pointer up arbitration",
);

const oldHandTapBlock = `        if (session.source === "hand") {\n          const point = clientPoint(event);\n          const stationary =\n            Math.hypot(\n              point.x - session.startPoint.x,\n              point.y - session.startPoint.y,\n            ) <= rightDoubleClickDistancePx;\n          if (stationary) {\n            const previous = primaryCanvasClickCandidateRef.current;\n            const elapsed =\n              previous === null\n                ? Number.POSITIVE_INFINITY\n                : event.timeStamp - previous.timestamp;\n            const withinDistance =\n              previous !== null &&\n              Math.hypot(\n                point.x - previous.point.x,\n                point.y - previous.point.y,\n              ) <= rightDoubleClickDistancePx;\n            if (\n              previous !== null &&\n              elapsed >= 0 &&\n              elapsed <= canvasPrimaryClickDelayMs &&\n              withinDistance\n            ) {\n              primaryCanvasClickCandidateRef.current = null;\n              if (primaryCanvasClickTimeoutRef.current !== null) {\n                window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n                primaryCanvasClickTimeoutRef.current = null;\n              }\n              onCanvasPrimaryDoubleClickRequest?.();\n            } else {\n              primaryCanvasClickCandidateRef.current = {\n                point,\n                timestamp: event.timeStamp,\n              };\n              if (primaryCanvasClickTimeoutRef.current !== null) {\n                window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n              }\n              primaryCanvasClickTimeoutRef.current = window.setTimeout(() => {\n                primaryCanvasClickTimeoutRef.current = null;\n                primaryCanvasClickCandidateRef.current = null;\n                onCanvasPrimaryClickRequest?.();\n              }, canvasPrimaryClickDelayMs);\n            }\n          }\n        }\n`;
board = replaceOnce(board, oldHandTapBlock, "", "remove duplicate hand tap recognizer");

board = replaceOnce(
  board,
  `    const handlePointerCancel = (event: PointerEvent) => {\n      if (drawingSessionRef.current?.pointerId === event.pointerId) {`,
  `    const handlePointerCancel = (event: PointerEvent) => {\n      if (\n        primaryCanvasPointerCandidateRef.current?.pointerId === event.pointerId\n      ) {\n        primaryCanvasPointerCandidateRef.current = null;\n      }\n      if (drawingSessionRef.current?.pointerId === event.pointerId) {`,
  "pointer cancel cleanup",
);

board = replaceOnce(
  board,
  `    const handleBlur = () => {\n      rightClickCandidateRef.current = null;`,
  `    const handleBlur = () => {\n      rightClickCandidateRef.current = null;\n      primaryCanvasPointerCandidateRef.current = null;`,
  "blur cleanup",
);

board = replaceOnce(
  board,
  `    finishSelection,\n    onCanvasPrimaryClickRequest,\n    onCanvasPrimaryDoubleClickRequest,\n    predictedWorldSamples,`,
  `    finishSelection,\n    clearPendingPrimaryCanvasTap,\n    predictedWorldSamples,\n    registerPrimaryCanvasTap,`,
  "window effect dependencies",
);

board = replaceOnce(
  board,
  `      discardWorldPointerMoves();\n      rightClickCandidateRef.current = null;`,
  `      discardWorldPointerMoves();\n      rightClickCandidateRef.current = null;\n      primaryCanvasPointerCandidateRef.current = null;`,
  "unmount candidate cleanup",
);

board = replaceOnce(
  board,
  `  useEffect(() => {\n    primaryCanvasClickCandidateRef.current = null;\n    if (primaryCanvasClickTimeoutRef.current !== null) {\n      window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n      primaryCanvasClickTimeoutRef.current = null;\n    }\n  }, [drawingModeKey, panMode, selectionModeKey]);`,
  `  useEffect(() => {\n    primaryCanvasPointerCandidateRef.current = null;\n    clearPendingPrimaryCanvasTap();\n  }, [\n    clearPendingPrimaryCanvasTap,\n    drawingModeKey,\n    panMode,\n    selectionModeKey,\n  ]);`,
  "mode change cleanup",
);

const selectionCaptureStart = board.indexOf(
  "  const handleSelectionBackgroundPointerDownCapture = (",
);
const pointerDownStart = board.indexOf(
  "  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {",
  selectionCaptureStart,
);
if (selectionCaptureStart < 0 || pointerDownStart < 0) {
  throw new Error("Missing selection capture block");
}
const newCapture = `  const handleCanvasPointerDownCapture = (\n    event: ReactPointerEvent<HTMLDivElement>,\n  ) => {\n    if (event.button !== 0) {\n      primaryCanvasPointerCandidateRef.current = null;\n      clearPendingPrimaryCanvasTap();\n      return;\n    }\n    if (\n      panSessionRef.current !== null ||\n      drawingSessionRef.current !== null ||\n      selectionSessionRef.current !== null\n    ) {\n      primaryCanvasPointerCandidateRef.current = null;\n      clearPendingPrimaryCanvasTap();\n      return;\n    }\n\n    const stage = stageRef.current;\n    if (stage === null) {\n      primaryCanvasPointerCandidateRef.current = null;\n      clearPendingPrimaryCanvasTap();\n      return;\n    }\n    const container = stage.container();\n    const bounds = container.getBoundingClientRect();\n    const hit = stage.getIntersection({\n      x: event.clientX - bounds.left,\n      y: event.clientY - bounds.top,\n    });\n    if (\n      hit !== null &&\n      (isTransformerTarget(hit) || objectIdFromTarget(hit) !== null)\n    ) {\n      primaryCanvasPointerCandidateRef.current = null;\n      clearPendingPrimaryCanvasTap();\n      return;\n    }\n\n    primaryCanvasPointerCandidateRef.current = {\n      pointerId: event.pointerId,\n      startPoint: clientPoint(event.nativeEvent),\n    };\n\n    if (selectionModeKey === null) {\n      return;\n    }\n    commitWheel();\n    event.preventDefault();\n    beginSelectionSession(event.nativeEvent, event.currentTarget, null);\n  };\n\n`;
board =
  board.slice(0, selectionCaptureStart) +
  newCapture +
  board.slice(pointerDownStart);

const clickStart = board.indexOf(
  "  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {",
);
const wheelStart = board.indexOf(
  "  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {",
  clickStart,
);
if (clickStart < 0 || wheelStart < 0) throw new Error("Missing click handlers");
const transformerClickOnly = `  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {\n    if (\n      event.evt.button !== 0 ||\n      selectionModeKey === null ||\n      !isTransformerTarget(event.target)\n    ) {\n      return;\n    }\n    const stage = event.target.getStage();\n    if (stage === null) return;\n    const captureElement = stage.container();\n    const screenPoint = elementPoint(event.evt, captureElement);\n    const objectId = objectIdBelowTransformer(stage, screenPoint);\n    if (objectId === null) return;\n    const point = screenToWorld(screenPoint, previewViewport);\n    const pointerId = -1;\n    selectionPointerCallbacksRef.current.start({\n      additive: event.evt.shiftKey,\n      areaOperation: event.evt.shiftKey ? "add" : "replace",\n      objectId,\n      point,\n      pointerId,\n      pressure: 0,\n    });\n    selectionPointerCallbacksRef.current.finish({\n      point,\n      pointerId,\n      pressure: 0,\n    });\n  };\n\n`;
board = board.slice(0, clickStart) + transformerClickOnly + board.slice(wheelStart);

board = replaceOnce(
  board,
  `      onPointerDownCapture={handleSelectionBackgroundPointerDownCapture}\n      className="board-stage"`,
  `      onPointerDownCapture={handleCanvasPointerDownCapture}\n      className="board-stage"`,
  "root capture handler",
);

board = replaceOnce(
  board,
  `      data-drawing={isDrawing}\n      data-lasso-points=`,
  `      data-drawing={isDrawing}\n      data-drawing-mode={drawingModeKey ?? "none"}\n      data-lasso-points=`,
  "drawing mode diagnostic",
);

board = replaceOnce(
  board,
  `      data-panning={isPanning}\n      data-selecting={isSelecting}`,
  `      data-pan-mode={panMode}\n      data-panning={isPanning}\n      data-selecting={isSelecting}\n      data-selection-mode={selectionModeKey ?? "none"}`,
  "selection mode diagnostics",
);

board = replaceOnce(
  board,
  `        onContextMenu={(event) => event.evt.preventDefault()}\n        onDblClick={handleDoubleClick}\n        onPointerDown={handlePointerDown}`,
  `        onContextMenu={(event) => event.evt.preventDefault()}\n        onPointerDown={handlePointerDown}`,
  "remove native double click handler",
);

writeFileSync(boardPath, board);

const testPath = "tests/e2e/canvas-mode-gestures.spec.ts";
writeFileSync(
  testPath,
  `import { expect, test, type Page } from "@playwright/test";\n\nasync function stagePoint(page: Page, x: number, y: number) {\n  const bounds = await page.getByTestId("board-stage").boundingBox();\n  expect(bounds).not.toBeNull();\n  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");\n  return { x: bounds.x + x, y: bounds.y + y };\n}\n\nasync function selectPen(page: Page): Promise<void> {\n  const drawingMenu = page.getByRole("button", { name: "Рисование" });\n  await drawingMenu.click();\n  await page.getByRole("menuitemradio", { name: "Перо (P)" }).click();\n  await expect(page.getByTestId("board-stage")).toHaveAttribute(\n    "data-drawing-mode",\n    "drawing.pen",\n  );\n}\n\nasync function slowDoubleClick(\n  page: Page,\n  point: { readonly x: number; readonly y: number },\n): Promise<void> {\n  await page.mouse.click(point.x, point.y);\n  await page.waitForTimeout(380);\n  await page.mouse.click(point.x, point.y);\n}\n\ntest.beforeEach(async ({ page }) => {\n  await page.goto("/");\n  await expect(page.getByTestId("board-stage")).toBeVisible();\n});\n\ntest("switches to Smart Ink from navigation, pen and selection without creating artifacts", async ({\n  page,\n}) => {\n  const stage = page.getByTestId("board-stage");\n  const first = await stagePoint(page, 280, 190);\n  const second = await stagePoint(page, 520, 310);\n  const third = await stagePoint(page, 710, 240);\n\n  await expect(stage).toHaveAttribute("data-pan-mode", "true");\n  await page.mouse.click(first.x, first.y);\n  await expect(stage).toHaveAttribute(\n    "data-drawing-mode",\n    "drawing.smart-ink",\n  );\n  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");\n\n  await selectPen(page);\n  await page.mouse.click(second.x, second.y);\n  await expect(stage).toHaveAttribute(\n    "data-drawing-mode",\n    "drawing.smart-ink",\n  );\n  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");\n\n  await page.keyboard.press("v");\n  await expect(stage).toHaveAttribute("data-selection-mode", /selection\\./);\n  await page.mouse.click(third.x, third.y);\n  await expect(stage).toHaveAttribute(\n    "data-drawing-mode",\n    "drawing.smart-ink",\n  );\n  await expect(stage).toHaveAttribute("data-selection-mode", "none");\n  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");\n});\n\ntest("recognizes a realistic slow double click from pen and Smart Ink", async ({\n  page,\n}) => {\n  const stage = page.getByTestId("board-stage");\n  const first = await stagePoint(page, 360, 260);\n  const second = await stagePoint(page, 620, 360);\n\n  await selectPen(page);\n  await slowDoubleClick(page, first);\n  await expect(stage).toHaveAttribute("data-selection-mode", /selection\\./);\n  await expect(stage).toHaveAttribute("data-drawing-mode", "none");\n  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");\n\n  await page.mouse.click(second.x, second.y);\n  await expect(stage).toHaveAttribute(\n    "data-drawing-mode",\n    "drawing.smart-ink",\n  );\n  await slowDoubleClick(page, first);\n  await expect(stage).toHaveAttribute("data-selection-mode", /selection\\./);\n  await expect(stage).toHaveAttribute("data-drawing-mode", "none");\n  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");\n});\n\ntest("keeps drag gestures in their active tools", async ({ page }) => {\n  const stage = page.getByTestId("board-stage");\n  const start = await stagePoint(page, 260, 260);\n  const finish = await stagePoint(page, 430, 350);\n\n  await selectPen(page);\n  await page.mouse.move(start.x, start.y);\n  await page.mouse.down();\n  await page.mouse.move(finish.x, finish.y, { steps: 8 });\n  await page.mouse.up();\n  await expect(stage).toHaveAttribute("data-drawing-mode", "drawing.pen");\n  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");\n\n  await page.keyboard.press("v");\n  await expect(stage).toHaveAttribute("data-selection-mode", /selection\\./);\n  const marqueeStart = await stagePoint(page, 650, 180);\n  const marqueeFinish = await stagePoint(page, 790, 320);\n  await page.mouse.move(marqueeStart.x, marqueeStart.y);\n  await page.mouse.down();\n  await page.mouse.move(marqueeFinish.x, marqueeFinish.y, { steps: 6 });\n  await page.mouse.up();\n  await expect(stage).toHaveAttribute("data-selection-mode", /selection\\./);\n  await expect(stage).toHaveAttribute("data-drawing-mode", "none");\n});\n`,
);
