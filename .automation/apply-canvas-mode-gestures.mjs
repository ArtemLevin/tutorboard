import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchFile(path, patches) {
  let source = fs.readFileSync(path, "utf8");
  for (const [before, after, label] of patches) {
    source = replaceOnce(source, before, after, label);
  }
  fs.writeFileSync(path, source);
}

patchFile("src/adapters/canvas-konva/BoardStage.tsx", [
  [
    'const rightDoubleClickDistancePx = 8;\n',
    'const rightDoubleClickDistancePx = 8;\nconst canvasPrimaryClickDelayMs = 280;\n',
    "canvas primary click delay",
  ],
  [
    'interface PanSession {\n  activated: boolean;\n  readonly canvasContextEligible: boolean;\n',
    'interface PanSession {\n  activated: boolean;\n  readonly canvasContextEligible: boolean;\n  readonly contextObjectId: BoardObjectId | null;\n',
    "pan context object",
  ],
  [
    'export interface CanvasContextMenuRequest {\n  readonly clientPoint: Vec2;\n  readonly worldPoint: Vec2;\n}\n',
    'export interface CanvasContextMenuRequest {\n  readonly clientPoint: Vec2;\n  readonly objectId: BoardObjectId | null;\n  readonly worldPoint: Vec2;\n}\n',
    "context menu request object",
  ],
  [
    '  readonly onCanvasContextMenuRequest?:\n    ((request: CanvasContextMenuRequest) => void) | undefined;\n',
    '  readonly onCanvasContextMenuRequest?:\n    ((request: CanvasContextMenuRequest) => void) | undefined;\n  readonly onCanvasPrimaryClickRequest?: (() => void) | undefined;\n  readonly onCanvasPrimaryDoubleClickRequest?: (() => void) | undefined;\n',
    "canvas gesture props",
  ],
  [
    '  onCanvasContextMenuRequest,\n  onObjectSettingsRequest,\n',
    '  onCanvasContextMenuRequest,\n  onCanvasPrimaryClickRequest,\n  onCanvasPrimaryDoubleClickRequest,\n  onObjectSettingsRequest,\n',
    "canvas gesture destructuring",
  ],
  [
    '  const rightClickCandidateRef = useRef<RightClickCandidate | null>(null);\n',
    '  const rightClickCandidateRef = useRef<RightClickCandidate | null>(null);\n  const primaryCanvasClickTimeoutRef = useRef<number | null>(null);\n  const rightContextMenuTimeoutRef = useRef<number | null>(null);\n',
    "gesture timeout refs",
  ],
  [
    '        if (\n          session.source === "right" &&\n          !session.activated &&\n          session.canvasContextEligible\n        ) {\n          canvasContextMenuRequestRef.current?.({\n            clientPoint: clientPoint(event),\n            worldPoint: screenToWorld(\n              elementPoint(event, session.captureElement),\n              session.startViewport,\n            ),\n          });\n        }\n        finishPan(true);\n',
    '        if (\n          session.source === "right" &&\n          !session.activated &&\n          session.canvasContextEligible\n        ) {\n          const request: CanvasContextMenuRequest = {\n            clientPoint: clientPoint(event),\n            objectId: session.contextObjectId,\n            worldPoint: screenToWorld(\n              elementPoint(event, session.captureElement),\n              session.startViewport,\n            ),\n          };\n          if (session.contextObjectId === null) {\n            canvasContextMenuRequestRef.current?.(request);\n          } else {\n            if (rightContextMenuTimeoutRef.current !== null) {\n              window.clearTimeout(rightContextMenuTimeoutRef.current);\n            }\n            rightContextMenuTimeoutRef.current = window.setTimeout(() => {\n              rightContextMenuTimeoutRef.current = null;\n              canvasContextMenuRequestRef.current?.(request);\n            }, rightDoubleClickDelayMs);\n          }\n        }\n        finishPan(true);\n',
    "right click context request",
  ],
  [
    '    const handleBlur = () => {\n      rightClickCandidateRef.current = null;\n',
    '    const handleBlur = () => {\n      rightClickCandidateRef.current = null;\n      if (primaryCanvasClickTimeoutRef.current !== null) {\n        window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n        primaryCanvasClickTimeoutRef.current = null;\n      }\n      if (rightContextMenuTimeoutRef.current !== null) {\n        window.clearTimeout(rightContextMenuTimeoutRef.current);\n        rightContextMenuTimeoutRef.current = null;\n      }\n',
    "blur timer cleanup",
  ],
  [
    '      discardWorldPointerMoves();\n      rightClickCandidateRef.current = null;\n',
    '      discardWorldPointerMoves();\n      rightClickCandidateRef.current = null;\n      if (primaryCanvasClickTimeoutRef.current !== null) {\n        window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n        primaryCanvasClickTimeoutRef.current = null;\n      }\n      if (rightContextMenuTimeoutRef.current !== null) {\n        window.clearTimeout(rightContextMenuTimeoutRef.current);\n        rightContextMenuTimeoutRef.current = null;\n      }\n',
    "unmount timer cleanup",
  ],
  [
    '  useLayoutEffect(() => {\n    if (selectionSessionRef.current !== null) {\n      finishSelection(false);\n    }\n  }, [finishSelection, selectionModeKey]);\n',
    '  useLayoutEffect(() => {\n    if (selectionSessionRef.current !== null) {\n      finishSelection(false);\n    }\n  }, [finishSelection, selectionModeKey]);\n\n  useEffect(() => {\n    if (primaryCanvasClickTimeoutRef.current !== null) {\n      window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n      primaryCanvasClickTimeoutRef.current = null;\n    }\n  }, [drawingModeKey, panMode, selectionModeKey]);\n',
    "mode change timer cleanup",
  ],
  [
    '  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {\n    const isRightButton = event.evt.button === 2;\n',
    '  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {\n    const isRightButton = event.evt.button === 2;\n    if (isRightButton && rightContextMenuTimeoutRef.current !== null) {\n      window.clearTimeout(rightContextMenuTimeoutRef.current);\n      rightContextMenuTimeoutRef.current = null;\n    }\n',
    "cancel pending selection menu",
  ],
  [
    '    panSessionRef.current = {\n      activated: source !== "right",\n      canvasContextEligible:\n        source === "right" &&\n        hitObjectId === null &&\n        !isTransformerTarget(event.target),\n      captureElement,\n',
    '    const contextObjectId =\n      hitObjectId !== null && selectedObjectIds.includes(hitObjectId)\n        ? hitObjectId\n        : null;\n    panSessionRef.current = {\n      activated: source !== "right",\n      canvasContextEligible:\n        source === "right" &&\n        !isTransformerTarget(event.target) &&\n        (hitObjectId === null || contextObjectId !== null),\n      contextObjectId,\n      captureElement,\n',
    "pan context eligibility",
  ],
  [
    '  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {\n    if (\n      event.evt.button !== 0 ||\n      selectionModeKey === null ||\n      !isTransformerTarget(event.target)\n    ) {\n      return;\n    }\n    const stage = event.target.getStage();\n    if (stage === null) return;\n    const captureElement = stage.container();\n    const screenPoint = elementPoint(event.evt, captureElement);\n    const objectId = objectIdBelowTransformer(stage, screenPoint);\n    if (objectId === null) return;\n    const point = screenToWorld(screenPoint, previewViewport);\n    const pointerId = -1;\n    selectionPointerCallbacksRef.current.start({\n      additive: event.evt.shiftKey,\n      areaOperation: event.evt.shiftKey ? "add" : "replace",\n      objectId,\n      point,\n      pointerId,\n      pressure: 0,\n    });\n    selectionPointerCallbacksRef.current.finish({\n      point,\n      pointerId,\n      pressure: 0,\n    });\n  };\n',
    '  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {\n    if (\n      event.evt.button === 0 &&\n      selectionModeKey !== null &&\n      isTransformerTarget(event.target)\n    ) {\n      const stage = event.target.getStage();\n      if (stage === null) return;\n      const captureElement = stage.container();\n      const screenPoint = elementPoint(event.evt, captureElement);\n      const objectId = objectIdBelowTransformer(stage, screenPoint);\n      if (objectId === null) return;\n      const point = screenToWorld(screenPoint, previewViewport);\n      const pointerId = -1;\n      selectionPointerCallbacksRef.current.start({\n        additive: event.evt.shiftKey,\n        areaOperation: event.evt.shiftKey ? "add" : "replace",\n        objectId,\n        point,\n        pointerId,\n        pressure: 0,\n      });\n      selectionPointerCallbacksRef.current.finish({\n        point,\n        pointerId,\n        pressure: 0,\n      });\n      return;\n    }\n    if (\n      event.evt.button !== 0 ||\n      !panMode ||\n      drawingModeKey !== null ||\n      selectionModeKey !== null ||\n      isTransformerTarget(event.target) ||\n      objectIdFromTarget(event.target) !== null\n    ) {\n      return;\n    }\n    if (event.evt.detail > 1) {\n      if (primaryCanvasClickTimeoutRef.current !== null) {\n        window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n        primaryCanvasClickTimeoutRef.current = null;\n      }\n      return;\n    }\n    if (primaryCanvasClickTimeoutRef.current !== null) {\n      window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n    }\n    primaryCanvasClickTimeoutRef.current = window.setTimeout(() => {\n      primaryCanvasClickTimeoutRef.current = null;\n      onCanvasPrimaryClickRequest?.();\n    }, canvasPrimaryClickDelayMs);\n  };\n\n  const handleDoubleClick = (\n    event: Konva.KonvaEventObject<MouseEvent>,\n  ) => {\n    if (\n      event.evt.button !== 0 ||\n      !panMode ||\n      drawingModeKey !== null ||\n      selectionModeKey !== null ||\n      isTransformerTarget(event.target) ||\n      objectIdFromTarget(event.target) !== null\n    ) {\n      return;\n    }\n    if (primaryCanvasClickTimeoutRef.current !== null) {\n      window.clearTimeout(primaryCanvasClickTimeoutRef.current);\n      primaryCanvasClickTimeoutRef.current = null;\n    }\n    event.cancelBubble = true;\n    event.evt.preventDefault();\n    onCanvasPrimaryDoubleClickRequest?.();\n  };\n',
    "canvas click handlers",
  ],
  [
    '        onClick={handleClick}\n        onContextMenu={(event) => event.evt.preventDefault()}\n',
    '        onClick={handleClick}\n        onContextMenu={(event) => event.evt.preventDefault()}\n        onDblClick={handleDoubleClick}\n',
    "stage double click binding",
  ],
]);

patchFile("src/app/board-chrome/CanvasContextMenu.tsx", [
  [
    'export interface CanvasContextMenuProps {\n  readonly canClear: boolean;\n  readonly canPaste: boolean;\n  readonly disabled: boolean;\n  readonly onClearRequest: () => void;\n  readonly onClose: () => void;\n  readonly onPaste: () => void;\n  readonly onText: () => void;\n  readonly position: Vec2;\n}\n\nconst menuWidth = 216;\nconst menuHeight = 154;\n',
    'export interface CanvasContextMenuProps {\n  readonly canClear: boolean;\n  readonly canCopy: boolean;\n  readonly canPaste: boolean;\n  readonly context: "canvas" | "selection";\n  readonly disabled: boolean;\n  readonly onClearRequest: () => void;\n  readonly onClose: () => void;\n  readonly onCopy: () => void;\n  readonly onPaste: () => void;\n  readonly onText: () => void;\n  readonly position: Vec2;\n}\n\nconst menuWidth = 216;\nconst canvasMenuHeight = 154;\nconst selectionMenuHeight = 54;\n',
    "context menu props",
  ],
  [
    'export function CanvasContextMenu({\n  canClear,\n  canPaste,\n  disabled,\n  onClearRequest,\n  onClose,\n  onPaste,\n  onText,\n  position,\n}: CanvasContextMenuProps) {\n',
    'export function CanvasContextMenu({\n  canClear,\n  canCopy,\n  canPaste,\n  context,\n  disabled,\n  onClearRequest,\n  onClose,\n  onCopy,\n  onPaste,\n  onText,\n  position,\n}: CanvasContextMenuProps) {\n',
    "context menu destructuring",
  ],
  [
    '  const top = Math.max(\n    viewportMargin,\n    Math.min(position.y, window.innerHeight - menuHeight - viewportMargin),\n  );\n',
    '  const menuHeight =\n    context === "selection" ? selectionMenuHeight : canvasMenuHeight;\n  const top = Math.max(\n    viewportMargin,\n    Math.min(position.y, window.innerHeight - menuHeight - viewportMargin),\n  );\n',
    "context menu height",
  ],
  [
    '      aria-label="Меню холста"\n',
    '      aria-label={context === "selection" ? "Меню выделения" : "Меню холста"}\n',
    "context menu aria label",
  ],
  [
    '      <button\n        disabled={disabled}\n        onClick={onText}\n        ref={firstItemRef}\n        role="menuitem"\n        type="button"\n      >\n        <span aria-hidden="true">T</span>\n        Текст\n      </button>\n      <button\n        disabled={disabled || !canPaste}\n        onClick={onPaste}\n        role="menuitem"\n        type="button"\n      >\n        <span aria-hidden="true">⌘</span>\n        Вставить\n      </button>\n      <div className="canvas-context-menu__separator" role="separator" />\n      <button\n        className="is-danger"\n        disabled={disabled || !canClear}\n        onClick={onClearRequest}\n        role="menuitem"\n        type="button"\n      >\n        <span aria-hidden="true">×</span>\n        Очистить холст\n      </button>\n',
    '      {context === "selection" ? (\n        <button\n          disabled={!canCopy}\n          onClick={onCopy}\n          ref={firstItemRef}\n          role="menuitem"\n          type="button"\n        >\n          <span aria-hidden="true">⧉</span>\n          Копировать\n        </button>\n      ) : (\n        <>\n          <button\n            disabled={disabled}\n            onClick={onText}\n            ref={firstItemRef}\n            role="menuitem"\n            type="button"\n          >\n            <span aria-hidden="true">T</span>\n            Текст\n          </button>\n          <button\n            disabled={disabled || !canPaste}\n            onClick={onPaste}\n            role="menuitem"\n            type="button"\n          >\n            <span aria-hidden="true">⌘</span>\n            Вставить\n          </button>\n          <div className="canvas-context-menu__separator" role="separator" />\n          <button\n            className="is-danger"\n            disabled={disabled || !canClear}\n            onClick={onClearRequest}\n            role="menuitem"\n            type="button"\n          >\n            <span aria-hidden="true">×</span>\n            Очистить холст\n          </button>\n        </>\n      )}\n',
    "selection copy menu",
  ],
]);

patchFile("src/app/App.tsx", [
  [
    '          onCanvasContextMenuRequest={(request) => {\n            setClearCanvasConfirmationOpen(false);\n            setCanvasContextMenu(request);\n          }}\n',
    '          onCanvasContextMenuRequest={(request) => {\n            setClearCanvasConfirmationOpen(false);\n            setCanvasContextMenu(request);\n          }}\n          onCanvasPrimaryClickRequest={() => {\n            if (readOnly) return;\n            setCanvasContextMenu(null);\n            activateTool("drawing.smart-ink");\n            setAccessibilityNotice("Включён режим Smart Ink");\n          }}\n          onCanvasPrimaryDoubleClickRequest={() => {\n            setCanvasContextMenu(null);\n            activateTool(selectionToolId);\n            setAccessibilityNotice("Включён режим выделения");\n          }}\n',
    "app canvas gesture callbacks",
  ],
  [
    '          <CanvasContextMenu\n            canClear={document.order.length > 0}\n            canPaste={clipboard !== null}\n            disabled={readOnly}\n',
    '          <CanvasContextMenu\n            canClear={document.order.length > 0}\n            canCopy={\n              canvasContextMenu.objectId !== null &&\n              selectionState.selectedObjectIds.includes(\n                canvasContextMenu.objectId,\n              )\n            }\n            canPaste={clipboard !== null}\n            context={\n              canvasContextMenu.objectId === null ? "canvas" : "selection"\n            }\n            disabled={readOnly}\n',
    "app context menu mode",
  ],
  [
    '            onClose={() => setCanvasContextMenu(null)}\n            onPaste={() => {\n',
    '            onClose={() => setCanvasContextMenu(null)}\n            onCopy={() => {\n              copySelection();\n              setCanvasContextMenu(null);\n            }}\n            onPaste={() => {\n',
    "app context copy handler",
  ],
]);

fs.writeFileSync(
  "tests/e2e/canvas-mode-gestures.spec.ts",
  `import { expect, test } from "@playwright/test";\n\ntest("switches quick modes from empty-canvas primary gestures", async ({\n  page,\n}) => {\n  await page.goto("/");\n  const stage = page.getByTestId("board-stage");\n  const bounds = await stage.boundingBox();\n  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");\n\n  const panButton = page.getByRole("button", { name: "Перемещение (H)" });\n  const aiButton = page.getByRole("button", { name: "ИИ-инструменты" });\n  const selectionButton = page.getByRole("button", { name: "Выделение" });\n\n  await expect(panButton).toHaveAttribute("aria-pressed", "true");\n  await page.mouse.click(bounds.x + 280, bounds.y + 190);\n  await expect(aiButton).toHaveAttribute("aria-pressed", "true");\n\n  await page.keyboard.press("h");\n  await expect(panButton).toHaveAttribute("aria-pressed", "true");\n  await page.mouse.dblclick(bounds.x + 520, bounds.y + 310);\n  await expect(selectionButton).toHaveAttribute("aria-pressed", "true");\n  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");\n});\n`,
);

const contextMenuTestPath = "tests/e2e/canvas-context-menu.spec.ts";
let contextMenuTests = fs.readFileSync(contextMenuTestPath, "utf8");
contextMenuTests += `\n\ntest("copies a selected object from its right-click menu", async ({ page }) => {\n  await page.goto("/");\n  const stage = page.getByTestId("board-stage");\n  const bounds = await stage.boundingBox();\n  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");\n  const center = {\n    x: bounds.x + bounds.width / 2,\n    y: bounds.y + bounds.height * 0.38,\n  };\n\n  await page.keyboard.press("r");\n  await page.mouse.move(center.x - 70, center.y - 50);\n  await page.mouse.down();\n  await page.mouse.move(center.x + 70, center.y + 50, { steps: 6 });\n  await page.mouse.up();\n  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");\n\n  await page.keyboard.press("v");\n  const contour = { x: center.x - 70, y: center.y };\n  await page.mouse.click(contour.x, contour.y);\n  await page.mouse.click(contour.x, contour.y, { button: "right" });\n\n  const selectionMenu = page.getByRole("menu", { name: "Меню выделения" });\n  await expect(selectionMenu).toBeVisible();\n  await selectionMenu.getByRole("menuitem", { name: "Копировать" }).click();\n  await expect(page.getByText("Скопировано: 1")).toBeVisible();\n\n  await page.mouse.click(bounds.x + 120, bounds.y + 120, { button: "right" });\n  const canvasMenu = page.getByRole("menu", { name: "Меню холста" });\n  await expect(canvasMenu).toBeVisible();\n  await canvasMenu.getByRole("menuitem", { name: "Вставить" }).click();\n  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");\n});\n`;
fs.writeFileSync(contextMenuTestPath, contextMenuTests);
