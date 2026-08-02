import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing replacement anchor in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous replacement anchor in ${path}`);
  }
  await writeFile(path, source.slice(0, first) + after + source.slice(first + before.length));
}

const renderer = "src/adapters/canvas-konva/coordinate-plot-renderer.tsx";

await replaceOnce(
  renderer,
  'import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";',
  'import {\n  useCallback,\n  useEffect,\n  useMemo,\n  useRef,\n  useState,\n  type ReactElement,\n} from "react";',
);

await replaceOnce(
  renderer,
  `interface PlotViewportPinchSession {\n  readonly startTouches: readonly [Vec2, Vec2];\n  readonly startViewport: CoordinatePlotViewport;\n}\n`,
  `interface PlotViewportPinchSession {\n  readonly startTouches: readonly [Vec2, Vec2];\n  readonly startViewport: CoordinatePlotViewport;\n}\n\ninterface PlotViewportRightDragSession extends PlotViewportDragSession {\n  readonly captureElement: HTMLElement;\n  readonly node: Konva.Node;\n  readonly pointerId: number;\n  readonly size: { readonly height: number; readonly width: number };\n}\n`,
);

await replaceOnce(
  renderer,
  `  const viewportDragRef = useRef<PlotViewportDragSession | null>(null);\n  const viewportPinchRef = useRef<PlotViewportPinchSession | null>(null);\n  const cursorContainerRef = useRef<HTMLElement | null>(null);`,
  `  const viewportDragRef = useRef<PlotViewportDragSession | null>(null);\n  const viewportPinchRef = useRef<PlotViewportPinchSession | null>(null);\n  const viewportRightDragRef =\n    useRef<PlotViewportRightDragSession | null>(null);\n  const viewportChangeRef = useRef(onViewportChange);\n  viewportChangeRef.current = onViewportChange;\n  const cursorContainerRef = useRef<HTMLElement | null>(null);`,
);

await replaceOnce(
  renderer,
  `  const setPlotCursor = (\n    node: Konva.Node,\n    cursor: "" | "grab" | "grabbing",\n  ) => {\n    const container = node.getStage()?.container();\n    if (container === undefined) return;\n    bindCursorContainer(container);\n    container.style.cursor =\n      cursor === "grab" && cursorPressedRef.current ? "grabbing" : cursor;\n  };\n`,
  `  const setPlotCursor = (\n    node: Konva.Node,\n    cursor: "" | "grab" | "grabbing",\n  ) => {\n    const container = node.getStage()?.container();\n    if (container === undefined) return;\n    bindCursorContainer(container);\n    container.style.cursor =\n      cursor === "grab" && cursorPressedRef.current ? "grabbing" : cursor;\n  };\n\n  const finishRightViewportDrag = useCallback((event?: PointerEvent) => {\n    const session = viewportRightDragRef.current;\n    if (session === null) return;\n    viewportRightDragRef.current = null;\n    if (session.captureElement.hasPointerCapture(session.pointerId)) {\n      session.captureElement.releasePointerCapture(session.pointerId);\n    }\n    cursorPressedRef.current = false;\n    const pointer =\n      event === undefined\n        ? null\n        : localClientPointer(session.node, event.clientX, event.clientY);\n    const inside =\n      pointer !== null &&\n      pointer.x >= 0 &&\n      pointer.x <= session.size.width &&\n      pointer.y >= 0 &&\n      pointer.y <= session.size.height;\n    session.captureElement.style.cursor = inside ? "grab" : "";\n  }, []);\n\n  const startRightViewportDrag = useCallback(\n    (\n      event: Konva.KonvaEventObject<PointerEvent>,\n      startViewport: CoordinatePlotViewport,\n      size: { readonly height: number; readonly width: number },\n    ) => {\n      if (\n        event.evt.button !== 2 ||\n        viewportChangeRef.current === undefined ||\n        viewportRightDragRef.current !== null\n      ) {\n        return false;\n      }\n      event.cancelBubble = true;\n      event.evt.preventDefault();\n      event.evt.stopPropagation();\n      const pointer = localPointer(event.currentTarget);\n      const container = event.currentTarget.getStage()?.container();\n      if (pointer === null || container === undefined) return false;\n      event.currentTarget.stopDrag();\n      viewportDragRef.current = null;\n      viewportPinchRef.current = null;\n      bindCursorContainer(container);\n      container.setPointerCapture(event.evt.pointerId);\n      viewportRightDragRef.current = {\n        captureElement: container,\n        node: event.currentTarget,\n        pointerId: event.evt.pointerId,\n        size,\n        startPointer: pointer,\n        startViewport,\n      };\n      cursorPressedRef.current = true;\n      container.style.cursor = "grabbing";\n      return true;\n    },\n    [],\n  );\n\n  useEffect(() => {\n    const handlePointerMove = (event: PointerEvent) => {\n      const session = viewportRightDragRef.current;\n      if (session === null || session.pointerId !== event.pointerId) return;\n      if ((event.buttons & 2) === 0) {\n        finishRightViewportDrag(event);\n        return;\n      }\n      event.preventDefault();\n      const pointer = localClientPointer(\n        session.node,\n        event.clientX,\n        event.clientY,\n      );\n      if (pointer === null) return;\n      viewportChangeRef.current?.(\n        panCoordinatePlotViewport(session.startViewport, session.size, {\n          x: pointer.x - session.startPointer.x,\n          y: pointer.y - session.startPointer.y,\n        }),\n      );\n    };\n    const handlePointerUp = (event: PointerEvent) => {\n      if (viewportRightDragRef.current?.pointerId === event.pointerId) {\n        finishRightViewportDrag(event);\n      }\n    };\n    const handlePointerCancel = (event: PointerEvent) => {\n      if (viewportRightDragRef.current?.pointerId === event.pointerId) {\n        finishRightViewportDrag();\n      }\n    };\n    const handleBlur = () => finishRightViewportDrag();\n    window.addEventListener("pointermove", handlePointerMove, {\n      passive: false,\n    });\n    window.addEventListener("pointerup", handlePointerUp);\n    window.addEventListener("pointercancel", handlePointerCancel);\n    window.addEventListener("blur", handleBlur);\n    return () => {\n      window.removeEventListener("pointermove", handlePointerMove);\n      window.removeEventListener("pointerup", handlePointerUp);\n      window.removeEventListener("pointercancel", handlePointerCancel);\n      window.removeEventListener("blur", handleBlur);\n      finishRightViewportDrag();\n    };\n  }, [finishRightViewportDrag]);\n`,
);

await replaceOnce(
  renderer,
  `  useEffect(() => {\n    if (editing) return;\n    viewportDragRef.current = null;\n    viewportPinchRef.current = null;\n    cursorPressedRef.current = false;`,
  `  useEffect(() => {\n    if (editing) return;\n    viewportDragRef.current = null;\n    viewportPinchRef.current = null;\n    finishRightViewportDrag();\n    cursorPressedRef.current = false;`,
);

await replaceOnce(
  renderer,
  `  }, [editing]);\n  const model = useMemo(`,
  `  }, [editing, finishRightViewportDrag]);\n  const model = useMemo(`,
);

await replaceOnce(
  renderer,
  `            onPointerDown={(event) => {\n              event.cancelBubble = true;\n              event.evt.preventDefault();\n              setPlotCursor(event.currentTarget, "grabbing");\n            }}`,
  `            onPointerDown={(event) => {\n              if (\n                startRightViewportDrag(\n                  event,\n                  definition.coordinateViewport,\n                  definition.size,\n                )\n              ) {\n                return;\n              }\n              event.cancelBubble = true;\n              event.evt.preventDefault();\n              setPlotCursor(event.currentTarget, "grabbing");\n            }}`,
);

await replaceOnce(
  renderer,
  `                onPointerDown={(event) => {\n                  if (!editing) return;\n                  event.cancelBubble = true;\n                  event.evt.preventDefault();\n                }}\n                onTap={() => selectSeries(series.id)}`,
  `                onPointerDown={(event) => {\n                  if (!editing) return;\n                  if (\n                    startRightViewportDrag(\n                      event,\n                      definition.coordinateViewport,\n                      definition.size,\n                    )\n                  ) {\n                    return;\n                  }\n                  event.cancelBubble = true;\n                  event.evt.preventDefault();\n                }}\n                onTap={() => selectSeries(series.id)}`,
);

await replaceOnce(
  "src/app/CoordinatePlotEditorPanel.tsx",
  `          На плоскости: перетаскивание сдвигает диапазон, колесо и жест двумя\n          пальцами масштабируют. Режим XY, X или Y выбирается на панели над\n          полотном; Shift и Alt временно переключают масштабирование на X или Y.`,
  `          На плоскости: перетаскивание или зажатая правая кнопка мыши сдвигают\n          диапазон графика, сохраняя положение основного полотна. Колесо и жест\n          двумя пальцами масштабируют. Режим XY, X или Y выбирается на панели;\n          Shift и Alt временно переключают масштабирование на X или Y.`,
);

await writeFile(
  "tests/e2e/coordinate-plot-right-pan.spec.ts",
  `import { readFile } from "node:fs/promises";\n\nimport { expect, test, type Page } from "@playwright/test";\n\ninterface ExportedPlotDocument {\n  readonly objects: Readonly<\n    Record<\n      string,\n      {\n        readonly definition?: {\n          readonly coordinateViewport: {\n            readonly xMin: number;\n          };\n          readonly size: { readonly height: number; readonly width: number };\n        };\n        readonly kind?: string;\n        readonly position: { readonly x: number; readonly y: number };\n      }\n    >\n  >;\n  readonly viewport: {\n    readonly offset: { readonly x: number; readonly y: number };\n    readonly zoom: number;\n  };\n}\n\nasync function exportDocument(page: Page): Promise<ExportedPlotDocument> {\n  const downloadPromise = page.waitForEvent("download");\n  await page.getByRole("button", { name: "Экспорт JSON" }).click();\n  const download = await downloadPromise;\n  const path = await download.path();\n  if (path === null) throw new Error("Expected exported board document");\n  return JSON.parse(await readFile(path, "utf8")) as ExportedPlotDocument;\n}\n\nfunction coordinatePlot(document: ExportedPlotDocument) {\n  const entry = Object.values(document.objects).find(\n    ({ kind }) => kind === "math.coordinate-plot",\n  );\n  if (entry?.definition === undefined) {\n    throw new Error("Expected coordinate plot in exported document");\n  }\n  return entry;\n}\n\ntest("right-button drag pans the active graph while the board stays fixed", async ({\n  page,\n}) => {\n  await page.goto("/");\n  await page\n    .getByRole("button", { name: "Создать координатную плоскость (G)" })\n    .click();\n  await expect(\n    page.getByRole("complementary", {\n      name: "Редактор координатной плоскости",\n    }),\n  ).toBeVisible();\n\n  const before = await exportDocument(page);\n  const beforePlot = coordinatePlot(before);\n  await page.getByRole("tab", { name: "Вид" }).click();\n  const minimumX = page.getByLabel("Минимальная граница X");\n  const initialMinimumX = Number(await minimumX.inputValue());\n  const stageBox = await page.getByTestId("board-stage").boundingBox();\n  if (stageBox === null) throw new Error("Expected board stage bounds");\n\n  const localPoint = {\n    x: beforePlot.definition.size.width * 0.25,\n    y: beforePlot.definition.size.height * 0.6,\n  };\n  const start = {\n    x:\n      stageBox.x +\n      before.viewport.offset.x +\n      (beforePlot.position.x + localPoint.x) * before.viewport.zoom,\n    y:\n      stageBox.y +\n      before.viewport.offset.y +\n      (beforePlot.position.y + localPoint.y) * before.viewport.zoom,\n  };\n\n  await page.mouse.move(start.x, start.y);\n  await page.mouse.down({ button: "right" });\n  await page.mouse.move(start.x + 96, start.y + 48, { steps: 8 });\n  await page.mouse.up({ button: "right" });\n\n  await expect\n    .poll(async () => Number(await minimumX.inputValue()))\n    .not.toBe(initialMinimumX);\n  const draftMinimumX = Number(await minimumX.inputValue());\n  await page.getByRole("button", { name: "Сохранить" }).click();\n  const after = await exportDocument(page);\n  const afterPlot = coordinatePlot(after);\n\n  expect(after.viewport).toEqual(before.viewport);\n  expect(afterPlot.position).toEqual(beforePlot.position);\n  expect(afterPlot.definition.coordinateViewport.xMin).toBeCloseTo(\n    draftMinimumX,\n    8,\n  );\n});\n`,
);

await writeFile(
  "docs/adr/ADR-021-coordinate-plot-right-button-pan.md",
  `# ADR-021: Right-button pan inside coordinate plots\n\n- Status: Accepted\n- Date: 2026-08-02\n- Scope: pointer routing between an active coordinate plot and the board viewport\n\n## Decision\n\n1. Right-button pointerdown inside an actively edited coordinate plot starts an internal viewport-pan session.\n2. The plot captures the pointer and converts client movement into local plot-pixel deltas.\n3. The event is consumed before BoardStage can start its global right-button pan session.\n4. Pointerup, pointercancel, window blur, editor close and component cleanup release capture and clear cursor state.\n5. Existing left-button drag, wheel zoom and touch pinch behavior remain available.\n\n## Verification\n\nA browser regression test creates a plot, drags its canvas with the right button, saves the draft and verifies three outcomes: the coordinate viewport changes, the board viewport stays equal to its original value and the plot object's board position stays equal to its original value.\n`,
);
