import { readFile, rm, writeFile } from "node:fs/promises";

async function read(path) {
  return readFile(path, "utf8");
}

async function write(path, content) {
  await writeFile(path, content, "utf8");
}

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

function replaceBetween(content, start, end, replacement, label) {
  const startIndex = content.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing start anchor: ${label}`);
  const endIndex = content.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing end anchor: ${label}`);
  return content.slice(0, startIndex) + replacement + content.slice(endIndex);
}

async function patchBoardStage() {
  const path = "src/adapters/canvas-konva/BoardStage.tsx";
  let content = await read(path);
  content = replaceOnce(
    content,
    `interface PanSession {\n  readonly captureElement: HTMLElement;`,
    `interface PanSession {\n  activated: boolean;\n  readonly captureElement: HTMLElement;`,
    "BoardStage pan activation field",
  );
  content = replaceOnce(
    content,
    `      event.preventDefault();\n      const current = clientPoint(event);\n      if (\n        session.source === "right" &&\n        Math.hypot(\n          current.x - session.startPoint.x,\n          current.y - session.startPoint.y,\n        ) > rightDoubleClickDistancePx\n      ) {\n        rightClickCandidateRef.current = null;\n      }\n      const viewport = panViewport(session.startViewport, {\n        x: current.x - session.startPoint.x,\n        y: current.y - session.startPoint.y,\n      });\n      session.latestViewport = viewport;\n      setPreviewViewport(viewport);`,
    `      event.preventDefault();\n      const current = clientPoint(event);\n      const displacement = Math.hypot(\n        current.x - session.startPoint.x,\n        current.y - session.startPoint.y,\n      );\n      if (session.source === "right" && !session.activated) {\n        if (displacement <= rightDoubleClickDistancePx) {\n          return;\n        }\n        session.activated = true;\n        rightClickCandidateRef.current = null;\n        onPanModeRequest?.();\n      }\n      const viewport = panViewport(session.startViewport, {\n        x: current.x - session.startPoint.x,\n        y: current.y - session.startPoint.y,\n      });\n      session.latestViewport = viewport;\n      setPreviewViewport(viewport);`,
    "BoardStage delayed right-pan activation",
  );
  content = replaceOnce(
    content,
    `    finishSelection,\n    selectionWorldSample,`,
    `    finishSelection,\n    onPanModeRequest,\n    selectionWorldSample,`,
    "BoardStage pointer effect dependency",
  );
  content = replaceOnce(
    content,
    `    const captureElement = stage.container();\n    captureElement.setPointerCapture(event.evt.pointerId);\n    const viewport = previewViewport;\n    if (source === "right") {\n      onPanModeRequest?.();\n    }\n    panSessionRef.current = {\n      captureElement,`,
    `    const captureElement = stage.container();\n    captureElement.setPointerCapture(event.evt.pointerId);\n    const viewport = previewViewport;\n    panSessionRef.current = {\n      activated: source !== "right",\n      captureElement,`,
    "BoardStage stationary right click side effect",
  );
  await write(path, content);
}

async function patchRendererRegistry() {
  const path = "src/adapters/canvas-konva/renderer-registry.tsx";
  let content = await read(path);
  content = replaceOnce(
    content,
    `  readonly onEditRequest?: ((objectId: BoardObjectId) => void) | undefined;`,
    `  readonly onSettingsRequest?:\n    | ((objectId: BoardObjectId) => void)\n    | undefined;`,
    "renderer settings callback",
  );
  content = replaceOnce(
    content,
    `  readonly onViewportChange?:\n    | ((objectId: BoardObjectId, viewport: CoordinatePlotViewport) => void)\n    | undefined;`,
    `  readonly onViewportChange?:\n    | ((objectId: BoardObjectId, viewport: CoordinatePlotViewport) => void)\n    | undefined;\n  readonly onViewportCommit?:\n    | ((objectId: BoardObjectId, viewport: CoordinatePlotViewport) => boolean)\n    | undefined;`,
    "renderer direct viewport commit callback",
  );
  await write(path, content);
}

async function patchDefaultRenderer() {
  const path = "src/adapters/canvas-konva/default-renderers.tsx";
  let content = await read(path);
  content = replaceOnce(
    content,
    `          {...(interaction?.onEditRequest === undefined\n            ? {}\n            : {\n                onEditRequest: () => interaction.onEditRequest?.(plot.id),\n              })}\n          {...(!editing\n            ? {}\n            : {\n                onSelectedSeriesChange: (seriesId) =>\n                  interaction?.onSelectedSeriesChange?.(plot.id, seriesId),\n                onViewportChange: (viewport) =>\n                  interaction?.onViewportChange?.(plot.id, viewport),\n                selectedSeriesId: interaction?.selectedSeriesId ?? null,\n              })}`,
    `          {...(interaction?.onSettingsRequest === undefined\n            ? {}\n            : {\n                onSettingsRequest: () =>\n                  interaction.onSettingsRequest?.(plot.id),\n              })}\n          {...(interaction?.onViewportCommit === undefined\n            ? {}\n            : {\n                onViewportCommit: (viewport) =>\n                  interaction.onViewportCommit?.(plot.id, viewport) ?? false,\n              })}\n          {...(!editing\n            ? {}\n            : {\n                onSelectedSeriesChange: (seriesId) =>\n                  interaction?.onSelectedSeriesChange?.(plot.id, seriesId),\n                onViewportChange: (viewport) =>\n                  interaction?.onViewportChange?.(plot.id, viewport),\n                selectedSeriesId: interaction?.selectedSeriesId ?? null,\n              })}`,
    "default coordinate plot renderer callbacks",
  );
  await write(path, content);
}

async function patchCoordinatePlotRenderer() {
  const path = "src/adapters/canvas-konva/coordinate-plot-renderer.tsx";
  let content = await read(path);
  content = replaceOnce(
    content,
    `const plotWheelZoomStep = 1.12;`,
    `const plotWheelZoomStep = 1.12;\nconst rightDoubleClickDelayMs = 450;\nconst rightGestureDistancePx = 8;`,
    "plot gesture constants",
  );
  content = replaceOnce(
    content,
    `interface PlotViewportRightDragSession extends PlotViewportDragSession {\n  readonly captureElement: HTMLElement;\n  readonly node: Konva.Node;\n  readonly pointerId: number;\n  readonly size: { readonly height: number; readonly width: number };\n}`,
    `interface PlotViewportRightGestureSession extends PlotViewportDragSession {\n  readonly captureElement: HTMLElement;\n  latestViewport: CoordinatePlotViewport;\n  moved: boolean;\n  readonly node: Konva.Node;\n  readonly pointerId: number;\n  readonly size: { readonly height: number; readonly width: number };\n  readonly startClientPoint: Vec2;\n}\n\ninterface RightClickCandidate {\n  readonly point: Vec2;\n  readonly timestamp: number;\n}`,
    "plot right gesture session",
  );
  content = replaceOnce(
    content,
    `export interface CoordinatePlotRendererProps {\n  readonly editing?: boolean | undefined;\n  readonly object: CoordinatePlotObject;\n  readonly onEditRequest?: (() => void) | undefined;`,
    `export interface CoordinatePlotRendererProps {\n  readonly editing?: boolean | undefined;\n  readonly object: CoordinatePlotObject;\n  readonly onSettingsRequest?: (() => void) | undefined;`,
    "plot renderer settings prop",
  );
  content = replaceOnce(
    content,
    `  readonly onViewportChange?:\n    ((viewport: CoordinatePlotViewport) => void) | undefined;`,
    `  readonly onViewportChange?:\n    ((viewport: CoordinatePlotViewport) => void) | undefined;\n  readonly onViewportCommit?:\n    ((viewport: CoordinatePlotViewport) => boolean) | undefined;`,
    "plot renderer commit prop",
  );
  content = replaceOnce(
    content,
    `function clamp(value: number, minimum: number, maximum: number): number {`,
    `function sameCoordinateViewport(\n  left: CoordinatePlotViewport,\n  right: CoordinatePlotViewport,\n): boolean {\n  return (\n    left.equalScale === right.equalScale &&\n    left.xMax === right.xMax &&\n    left.xMin === right.xMin &&\n    left.yMax === right.yMax &&\n    left.yMin === right.yMin\n  );\n}\n\nfunction clamp(value: number, minimum: number, maximum: number): number {`,
    "plot viewport equality helper",
  );
  content = replaceOnce(
    content,
    `  object,\n  onEditRequest,\n  onSelectedSeriesChange,\n  onViewportChange,`,
    `  object,\n  onSelectedSeriesChange,\n  onSettingsRequest,\n  onViewportChange,\n  onViewportCommit,`,
    "plot renderer destructuring",
  );
  content = replaceOnce(
    content,
    `  const viewportRightDragRef = useRef<PlotViewportRightDragSession | null>(\n    null,\n  );\n  const viewportChangeRef = useRef(onViewportChange);`,
    `  const viewportRightGestureRef =\n    useRef<PlotViewportRightGestureSession | null>(null);\n  const rightClickCandidateRef = useRef<RightClickCandidate | null>(null);\n  const [directViewportPreview, setDirectViewportPreview] =\n    useState<CoordinatePlotViewport | null>(null);\n  const editingRef = useRef(editing);\n  const settingsRequestRef = useRef(onSettingsRequest);\n  const viewportChangeRef = useRef(onViewportChange);\n  const viewportCommitRef = useRef(onViewportCommit);`,
    "plot gesture refs",
  );
  content = replaceOnce(
    content,
    `  useEffect(() => {\n    viewportChangeRef.current = onViewportChange;\n  }, [onViewportChange]);`,
    `  useEffect(() => {\n    editingRef.current = editing;\n  }, [editing]);\n  useEffect(() => {\n    settingsRequestRef.current = onSettingsRequest;\n  }, [onSettingsRequest]);\n  useEffect(() => {\n    viewportChangeRef.current = onViewportChange;\n  }, [onViewportChange]);\n  useEffect(() => {\n    viewportCommitRef.current = onViewportCommit;\n  }, [onViewportCommit]);`,
    "plot callback refs",
  );
  content = replaceOnce(
    content,
    `    const handlePointerDown = () => {\n      cursorPressedRef.current = true;`,
    `    const handlePointerDown = (event: PointerEvent) => {\n      if (event.button === 2) return;\n      cursorPressedRef.current = true;`,
    "plot cursor right click guard",
  );

  const gestureStart = `  const finishRightViewportDrag = useCallback((event?: PointerEvent) => {`;
  const gestureEnd = `  useEffect(\n    () => () => {\n      cursorCleanupRef.current?.();`;
  const gestureReplacement = `  const updateRightViewportPreview = useCallback(\n    (session: PlotViewportRightGestureSession, pointer: Vec2) => {\n      const viewport = panCoordinatePlotViewport(\n        session.startViewport,\n        session.size,\n        {\n          x: pointer.x - session.startPointer.x,\n          y: pointer.y - session.startPointer.y,\n        },\n      );\n      session.latestViewport = viewport;\n      if (editingRef.current) {\n        viewportChangeRef.current?.(viewport);\n      } else {\n        setDirectViewportPreview(viewport);\n      }\n    },\n    [],\n  );\n\n  const finishRightViewportGesture = useCallback(\n    (event?: PointerEvent, commit = false) => {\n      const session = viewportRightGestureRef.current;\n      if (session === null) return;\n      if (commit && event !== undefined && session.moved) {\n        const pointer = localClientPointer(\n          session.node,\n          event.clientX,\n          event.clientY,\n        );\n        if (pointer !== null) updateRightViewportPreview(session, pointer);\n      }\n      viewportRightGestureRef.current = null;\n      if (session.captureElement.hasPointerCapture(session.pointerId)) {\n        session.captureElement.releasePointerCapture(session.pointerId);\n      }\n      cursorPressedRef.current = false;\n      const pointer =\n        event === undefined\n          ? null\n          : localClientPointer(session.node, event.clientX, event.clientY);\n      const inside =\n        pointer !== null &&\n        pointer.x >= 0 &&\n        pointer.x <= session.size.width &&\n        pointer.y >= 0 &&\n        pointer.y <= session.size.height;\n      const canPan = editingRef.current\n        ? viewportChangeRef.current !== undefined\n        : viewportCommitRef.current !== undefined;\n      session.captureElement.style.cursor = inside && canPan ? "grab" : "";\n\n      if (!commit) {\n        rightClickCandidateRef.current = null;\n        if (!editingRef.current) setDirectViewportPreview(null);\n        return;\n      }\n      if (session.moved) {\n        if (!editingRef.current) {\n          const accepted =\n            viewportCommitRef.current?.(session.latestViewport) ?? false;\n          if (!accepted) setDirectViewportPreview(null);\n        }\n        return;\n      }\n      if (event === undefined) return;\n      const clickPoint = { x: event.clientX, y: event.clientY };\n      const previous = rightClickCandidateRef.current;\n      const elapsed =\n        previous === null\n          ? Number.POSITIVE_INFINITY\n          : event.timeStamp - previous.timestamp;\n      const withinDistance =\n        previous !== null &&\n        Math.hypot(\n          clickPoint.x - previous.point.x,\n          clickPoint.y - previous.point.y,\n        ) <= rightGestureDistancePx;\n      if (\n        previous !== null &&\n        elapsed >= 0 &&\n        elapsed <= rightDoubleClickDelayMs &&\n        withinDistance\n      ) {\n        rightClickCandidateRef.current = null;\n        settingsRequestRef.current?.();\n      } else {\n        rightClickCandidateRef.current = {\n          point: clickPoint,\n          timestamp: event.timeStamp,\n        };\n      }\n    },\n    [updateRightViewportPreview],\n  );\n\n  const startRightViewportGesture = useCallback(\n    (\n      event: Konva.KonvaEventObject<PointerEvent>,\n      startViewport: CoordinatePlotViewport,\n      size: { readonly height: number; readonly width: number },\n    ) => {\n      const enabled =\n        settingsRequestRef.current !== undefined ||\n        viewportChangeRef.current !== undefined ||\n        viewportCommitRef.current !== undefined;\n      if (\n        event.evt.button !== 2 ||\n        !enabled ||\n        viewportRightGestureRef.current !== null\n      ) {\n        return false;\n      }\n      event.cancelBubble = true;\n      event.evt.preventDefault();\n      event.evt.stopPropagation();\n      const pointer = localPointer(event.currentTarget);\n      const container = event.currentTarget.getStage()?.container();\n      if (pointer === null || container === undefined) return false;\n      event.currentTarget.stopDrag();\n      viewportDragRef.current = null;\n      viewportPinchRef.current = null;\n      bindCursorContainer(container);\n      container.setPointerCapture(event.evt.pointerId);\n      viewportRightGestureRef.current = {\n        captureElement: container,\n        latestViewport: startViewport,\n        moved: false,\n        node: event.currentTarget,\n        pointerId: event.evt.pointerId,\n        size,\n        startClientPoint: {\n          x: event.evt.clientX,\n          y: event.evt.clientY,\n        },\n        startPointer: pointer,\n        startViewport,\n      };\n      return true;\n    },\n    [],\n  );\n\n  useEffect(() => {\n    const handlePointerMove = (event: PointerEvent) => {\n      const session = viewportRightGestureRef.current;\n      if (session === null || session.pointerId !== event.pointerId) return;\n      if ((event.buttons & 2) === 0) {\n        finishRightViewportGesture(event, true);\n        return;\n      }\n      event.preventDefault();\n      const displacement = Math.hypot(\n        event.clientX - session.startClientPoint.x,\n        event.clientY - session.startClientPoint.y,\n      );\n      if (!session.moved && displacement <= rightGestureDistancePx) return;\n      if (!session.moved) {\n        session.moved = true;\n        rightClickCandidateRef.current = null;\n        session.captureElement.style.cursor = "grabbing";\n      }\n      const pointer = localClientPointer(\n        session.node,\n        event.clientX,\n        event.clientY,\n      );\n      if (pointer !== null) updateRightViewportPreview(session, pointer);\n    };\n    const handlePointerUp = (event: PointerEvent) => {\n      if (viewportRightGestureRef.current?.pointerId === event.pointerId) {\n        finishRightViewportGesture(event, true);\n      }\n    };\n    const handlePointerCancel = (event: PointerEvent) => {\n      if (viewportRightGestureRef.current?.pointerId === event.pointerId) {\n        finishRightViewportGesture(undefined, false);\n      }\n    };\n    const handleBlur = () => finishRightViewportGesture(undefined, false);\n    window.addEventListener("pointermove", handlePointerMove, {\n      passive: false,\n    });\n    window.addEventListener("pointerup", handlePointerUp);\n    window.addEventListener("pointercancel", handlePointerCancel);\n    window.addEventListener("blur", handleBlur);\n    return () => {\n      window.removeEventListener("pointermove", handlePointerMove);\n      window.removeEventListener("pointerup", handlePointerUp);\n      window.removeEventListener("pointercancel", handlePointerCancel);\n      window.removeEventListener("blur", handleBlur);\n      finishRightViewportGesture(undefined, false);\n    };\n  }, [finishRightViewportGesture, updateRightViewportPreview]);\n`;
  content = replaceBetween(
    content,
    gestureStart,
    gestureEnd,
    gestureReplacement,
    "plot right gesture implementation",
  );
  content = replaceOnce(
    content,
    `      finishRightViewportDrag();`,
    `      finishRightViewportGesture(undefined, false);`,
    "plot cleanup gesture",
  );
  content = replaceOnce(
    content,
    `  useEffect(() => {\n    if (editing) return;\n    viewportDragRef.current = null;\n    viewportPinchRef.current = null;\n    finishRightViewportDrag();\n    cursorPressedRef.current = false;\n    if (cursorContainerRef.current !== null) {\n      cursorContainerRef.current.style.cursor = "";\n    }\n  }, [editing, finishRightViewportDrag]);\n  const model = useMemo(\n    () =>\n      createCoordinatePlotRenderModel({\n        cache: coordinatePlotSamplingCache,\n        object,\n        zoom,\n      }),\n    [object, zoom],\n  );`,
    `  useEffect(() => {\n    viewportDragRef.current = null;\n    viewportPinchRef.current = null;\n    finishRightViewportGesture(undefined, false);\n    cursorPressedRef.current = false;\n    if (cursorContainerRef.current !== null) {\n      cursorContainerRef.current.style.cursor = "";\n    }\n  }, [editing, finishRightViewportGesture]);\n  useEffect(() => {\n    if (\n      directViewportPreview !== null &&\n      sameCoordinateViewport(\n        object.definition.coordinateViewport,\n        directViewportPreview,\n      )\n    ) {\n      setDirectViewportPreview(null);\n    }\n  }, [directViewportPreview, object.definition.coordinateViewport]);\n  const renderedObject = useMemo(\n    () =>\n      directViewportPreview === null\n        ? object\n        : {\n            ...object,\n            definition: {\n              ...object.definition,\n              coordinateViewport: directViewportPreview,\n            },\n          },\n    [directViewportPreview, object],\n  );\n  const model = useMemo(\n    () =>\n      createCoordinatePlotRenderModel({\n        cache: coordinatePlotSamplingCache,\n        object: renderedObject,\n        zoom,\n      }),\n    [renderedObject, zoom],\n  );`,
    "plot preview model",
  );
  content = replaceOnce(
    content,
    `    <Group\n      name="board-transform-target coordinate-plot-root"\n      onDblClick={(event) => {\n        if (onEditRequest === undefined) return;\n        event.cancelBubble = true;\n        onEditRequest();\n      }}\n      opacity={object.style.opacity}`,
    `    <Group\n      name="board-transform-target coordinate-plot-root"\n      opacity={object.style.opacity}`,
    "remove left double click editor entry",
  );
  content = replaceOnce(
    content,
    `  const selectSeries = (seriesId: PlotSeriesId | null) => {\n    if (!controlled) setInternalSelectedSeriesId(seriesId);\n    onSelectedSeriesChange?.(seriesId);\n  };\n\n  return (`,
    `  const selectSeries = (seriesId: PlotSeriesId | null) => {\n    if (!controlled) setInternalSelectedSeriesId(seriesId);\n    onSelectedSeriesChange?.(seriesId);\n  };\n  const rightGestureEnabled =\n    onSettingsRequest !== undefined ||\n    onViewportCommit !== undefined ||\n    (editing && onViewportChange !== undefined);\n  const internalPanEnabled = editing\n    ? onViewportChange !== undefined\n    : onViewportCommit !== undefined;\n\n  return (`,
    "plot gesture capability flags",
  );
  content = replaceOnce(
    content,
    `{editing && onViewportChange !== undefined ? (\n          <Rect\n            dragBoundFunc={() => ({ x: 0, y: 0 })}\n            draggable`,
    `{rightGestureEnabled ? (\n          <Rect\n            dragBoundFunc={() => ({ x: 0, y: 0 })}\n            draggable={editing && onViewportChange !== undefined}`,
    "plot pan surface availability",
  );
  content = replaceOnce(
    content,
    `            onMouseEnter={(event) => setPlotCursor(event.currentTarget, "grab")}`,
    `            onMouseEnter={(event) => {\n              if (internalPanEnabled) {\n                setPlotCursor(event.currentTarget, "grab");\n              }\n            }}`,
    "plot hover cursor capability",
  );
  content = replaceOnce(
    content,
    `              onViewportChange(\n                panCoordinatePlotViewport(`,
    `              onViewportChange?.(\n                panCoordinatePlotViewport(`,
    "plot drag end optional callback",
  );
  content = replaceOnce(
    content,
    `              onViewportChange(\n                panCoordinatePlotViewport(`,
    `              onViewportChange?.(\n                panCoordinatePlotViewport(`,
    "plot drag move optional callback",
  );
  content = replaceOnce(
    content,
    `                startRightViewportDrag(`,
    `                startRightViewportGesture(`,
    "plot surface right gesture start",
  );
  content = replaceOnce(
    content,
    `              event.cancelBubble = true;\n              event.evt.preventDefault();\n              setPlotCursor(event.currentTarget, "grabbing");`,
    `              if (!editing || onViewportChange === undefined) return;\n              event.cancelBubble = true;\n              event.evt.preventDefault();\n              setPlotCursor(event.currentTarget, "grabbing");`,
    "plot closed left pointer routing",
  );
  content = content.replaceAll(
    `                  onViewportChange(\n                    pinchCoordinatePlotViewport(`,
    `                  onViewportChange?.(\n                    pinchCoordinatePlotViewport(`,
  );
  content = content.replaceAll(
    `                    startRightViewportDrag(`,
    `                    startRightViewportGesture(`,
  );
  content = replaceOnce(
    content,
    `                onPointerDown={(event) => {\n                  if (!editing) return;\n                  if (\n                    startRightViewportGesture(`,
    `                onPointerDown={(event) => {\n                  if (\n                    startRightViewportGesture(`,
    "plot series closed right gesture",
  );
  content = replaceOnce(
    content,
    `                  ) {\n                    return;\n                  }\n                  event.cancelBubble = true;`,
    `                  ) {\n                    return;\n                  }\n                  if (!editing) return;\n                  event.cancelBubble = true;`,
    "plot series left routing",
  );
  content = replaceOnce(
    content,
    `                onPointerDown={(event) => {\n                  if (!editing) return;\n                  event.cancelBubble = true;\n                  event.evt.preventDefault();\n                }}`,
    `                onPointerDown={(event) => {\n                  if (\n                    startRightViewportGesture(\n                      event,\n                      definition.coordinateViewport,\n                      definition.size,\n                    )\n                  ) {\n                    return;\n                  }\n                  if (!editing) return;\n                  event.cancelBubble = true;\n                  event.evt.preventDefault();\n                }}`,
    "plot legend right gesture",
  );
  await write(path, content);
}

async function patchApp() {
  const path = "src/app/App.tsx";
  let content = await read(path);
  const marker = `  const setCoordinatePlotZoomAxis = useCallback(`;
  const insertion = `  const commitCoordinatePlotViewport = useCallback(\n    (\n      objectId: BoardObjectId,\n      viewport: CoordinatePlotDefinition["coordinateViewport"],\n    ): boolean => {\n      const current = documentRef.current;\n      const object = current.objects[objectId];\n      if (\n        readOnly ||\n        object?.kind !== "math.coordinate-plot" ||\n        object.source.kind !== "user" ||\n        object.locked ||\n        (object.groupId !== null &&\n          current.groups[object.groupId]?.locked === true)\n      ) {\n        return false;\n      }\n      const expected = object.definition;\n      const previous = expected.coordinateViewport;\n      if (\n        previous.equalScale === viewport.equalScale &&\n        previous.xMax === viewport.xMax &&\n        previous.xMin === viewport.xMin &&\n        previous.yMax === viewport.yMax &&\n        previous.yMin === viewport.yMin\n      ) {\n        return true;\n      }\n      const result = commitCommand({\n        ...createCommandMetadata(),\n        expected,\n        kind: "core.coordinate-plot.update",\n        objectId,\n        replacement: { ...expected, coordinateViewport: viewport },\n      });\n      if (result.ok) {\n        setAccessibilityNotice("Диапазон координатной плоскости изменён");\n      }\n      return result.ok;\n    },\n    [commitCommand, createCommandMetadata, readOnly],\n  );\n\n`;
  const index = content.indexOf(marker);
  if (index < 0) throw new Error("Missing App viewport callback insertion anchor");
  content = content.slice(0, index) + insertion + content.slice(index);
  content = replaceOnce(
    content,
    `      onSelectedSeriesChange: selectCoordinatePlotSeries,\n      onViewportChange: updateCoordinatePlotViewport,`,
    `      onSelectedSeriesChange: selectCoordinatePlotSeries,\n      onSettingsRequest: requestObjectSettings,\n      onViewportChange: updateCoordinatePlotViewport,\n      onViewportCommit: commitCoordinatePlotViewport,`,
    "App coordinate plot callbacks",
  );
  content = replaceOnce(
    content,
    `      coordinatePlotEditor,\n      selectCoordinatePlotSeries,\n      updateCoordinatePlotViewport,`,
    `      commitCoordinatePlotViewport,\n      coordinatePlotEditor,\n      requestObjectSettings,\n      selectCoordinatePlotSeries,\n      updateCoordinatePlotViewport,`,
    "App interaction dependencies",
  );
  await write(path, content);
}

async function patchInteractionHelper() {
  const path = "tests/e2e/coordinate-plot-interaction.ts";
  await write(
    path,
    `import { expect, type Page } from "@playwright/test";\n\nexport interface ScreenPoint {\n  readonly x: number;\n  readonly y: number;\n}\n\nexport async function stageCenter(page: Page): Promise<ScreenPoint> {\n  const bounds = await page.getByTestId("board-stage").boundingBox();\n  if (bounds === null) throw new Error("Expected TutorBoard stage bounds");\n  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };\n}\n\nexport async function rightDoubleClickAt(\n  page: Page,\n  point: ScreenPoint,\n): Promise<void> {\n  await page.mouse.move(point.x, point.y);\n  await page.mouse.down({ button: "right" });\n  await page.mouse.up({ button: "right" });\n  await page.waitForTimeout(70);\n  await page.mouse.down({ button: "right" });\n  await page.mouse.up({ button: "right" });\n}\n\nexport async function openCoordinatePlotEditorByRightDoubleClick(\n  page: Page,\n  point?: ScreenPoint,\n): Promise<void> {\n  await rightDoubleClickAt(page, point ?? (await stageCenter(page)));\n  await expect(\n    page.getByRole("complementary", {\n      name: "Редактор координатной плоскости",\n    }),\n  ).toBeVisible();\n}\n`,
  );
}

async function patchPlotAccessibility() {
  const path = "tests/e2e/coordinate-plot-accessibility.spec.ts";
  let content = await read(path);
  const creation = `  await createButton.click();\n\n  const editor = page.getByTestId("coordinate-plot-editor");`;
  content = content.replaceAll(
    creation,
    `  await createButton.click();\n  await openCoordinatePlotEditorByRightDoubleClick(page);\n\n  const editor = page.getByTestId("coordinate-plot-editor");`,
  );
  await write(path, content);
}

async function patchPlotRightPanSpec() {
  const path = "tests/e2e/coordinate-plot-right-pan.spec.ts";
  await write(
    path,
    `import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";\n\nimport { readFile } from "node:fs/promises";\n\nimport { expect, test, type Page } from "@playwright/test";\n\ninterface ExportedPlotDocument {\n  readonly objects: Readonly<Record<string, {\n    readonly definition?: {\n      readonly coordinateViewport: {\n        readonly equalScale: boolean;\n        readonly xMax: number;\n        readonly xMin: number;\n        readonly yMax: number;\n        readonly yMin: number;\n      };\n      readonly size: { readonly height: number; readonly width: number };\n    };\n    readonly kind?: string;\n    readonly position: { readonly x: number; readonly y: number };\n  }>>;\n  readonly viewport: {\n    readonly offset: { readonly x: number; readonly y: number };\n    readonly zoom: number;\n  };\n}\n\nasync function exportDocument(page: Page): Promise<ExportedPlotDocument> {\n  const downloadPromise = page.waitForEvent("download");\n  await page.getByRole("button", { name: "Экспорт JSON" }).click();\n  const download = await downloadPromise;\n  const path = await download.path();\n  if (path === null) throw new Error("Expected exported board document");\n  return JSON.parse(await readFile(path, "utf8")) as ExportedPlotDocument;\n}\n\nfunction coordinatePlot(document: ExportedPlotDocument) {\n  const entry = Object.values(document.objects).find(\n    ({ kind }) => kind === "math.coordinate-plot",\n  );\n  if (entry?.definition === undefined) {\n    throw new Error("Expected coordinate plot in exported document");\n  }\n  return entry;\n}\n\nfunction plotScreenPoint(document: ExportedPlotDocument) {\n  const plot = coordinatePlot(document);\n  return {\n    x:\n      document.viewport.offset.x +\n      (plot.position.x + plot.definition.size.width * 0.3) *\n        document.viewport.zoom,\n    y:\n      document.viewport.offset.y +\n      (plot.position.y + plot.definition.size.height * 0.6) *\n        document.viewport.zoom,\n  };\n}\n\ntest("right-button drag pans a closed graph as one history item while the board stays fixed", async ({ page }) => {\n  await page.goto("/");\n  await page\n    .getByRole("button", { name: "Создать координатную плоскость (G)" })\n    .click();\n  await expect(\n    page.getByRole("complementary", { name: "Редактор координатной плоскости" }),\n  ).toBeHidden();\n\n  const before = await exportDocument(page);\n  const beforePlot = coordinatePlot(before);\n  const stageBox = await page.getByTestId("board-stage").boundingBox();\n  if (stageBox === null) throw new Error("Expected board stage bounds");\n  const local = plotScreenPoint(before);\n  const start = { x: stageBox.x + local.x, y: stageBox.y + local.y };\n\n  await page.mouse.move(start.x, start.y);\n  await page.mouse.down({ button: "right" });\n  await page.mouse.move(start.x + 96, start.y + 48, { steps: 8 });\n  await page.mouse.up({ button: "right" });\n  await expect(page.getByTestId("history-depth")).toHaveText("2/0");\n\n  const after = await exportDocument(page);\n  const afterPlot = coordinatePlot(after);\n  expect(after.viewport).toEqual(before.viewport);\n  expect(afterPlot.position).toEqual(beforePlot.position);\n  expect(afterPlot.definition.coordinateViewport.xMin).not.toBe(\n    beforePlot.definition.coordinateViewport.xMin,\n  );\n\n  await page.keyboard.press("Control+z");\n  await expect(page.getByTestId("history-depth")).toHaveText("1/1");\n  const undone = await exportDocument(page);\n  expect(coordinatePlot(undone).definition.coordinateViewport).toEqual(\n    beforePlot.definition.coordinateViewport,\n  );\n});\n\ntest("single right click keeps the active tool and double click opens graph settings", async ({ page }) => {\n  await page.goto("/");\n  await page\n    .getByRole("button", { name: "Создать координатную плоскость (G)" })\n    .click();\n  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();\n  const document = await exportDocument(page);\n  const stageBox = await page.getByTestId("board-stage").boundingBox();\n  if (stageBox === null) throw new Error("Expected board stage bounds");\n  const local = plotScreenPoint(document);\n  const point = { x: stageBox.x + local.x, y: stageBox.y + local.y };\n\n  await page.mouse.click(point.x, point.y, { button: "right" });\n  await expect(\n    page.getByRole("button", { name: "Прямоугольник (R)" }),\n  ).toHaveAttribute("aria-pressed", "true");\n  await expect(\n    page.getByRole("complementary", { name: "Редактор координатной плоскости" }),\n  ).toBeHidden();\n\n  await openCoordinatePlotEditorByRightDoubleClick(page, point);\n});\n`,
  );
}

async function patchInspectorE2E() {
  const selectionPath = "tests/e2e/selection.spec.ts";
  let selection = await read(selectionPath);
  selection = replaceOnce(
    selection,
    `import type { Page } from "@playwright/test";`,
    `import type { Page } from "@playwright/test";\nimport { rightDoubleClickAt } from "./coordinate-plot-interaction.js";`,
    "selection helper import",
  );
  selection = replaceOnce(
    selection,
    `  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");\n\n  await page\n    .getByRole("button", { name: "Заблокировать", exact: true })`,
    `  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");\n  await rightDoubleClickAt(page, focus);\n\n  await page\n    .getByRole("button", { name: "Заблокировать", exact: true })`,
    "selection multi inspector",
  );
  selection = replaceOnce(
    selection,
    `  await expect(page.getByTestId("board-stage")).toHaveAttribute(\n    "data-transformable-count",\n    "1",\n  );\n\n  await page\n    .getByRole("button", { name: "Увеличить выделение on 10%" })`,
    `  await expect(page.getByTestId("board-stage")).toHaveAttribute(\n    "data-transformable-count",\n    "1",\n  );\n  await rightDoubleClickAt(page, rectangle);\n\n  await page\n    .getByRole("button", { name: "Увеличить выделение on 10%" })`,
    "selection transform inspector",
  );
  selection = replaceOnce(
    selection,
    `  await expect(\n    page.getByRole("button", { name: "Увеличить выделение on 10%" }),\n  ).toBeVisible();`,
    `  await expect(\n    page.getByRole("button", { name: "Увеличить выделение on 10%" }),\n  ).toBeHidden();\n  await rightDoubleClickAt(page, contour);\n  await expect(\n    page.getByRole("button", { name: "Увеличить выделение on 10%" }),\n  ).toBeVisible();`,
    "selection explicit settings contract",
  );
  selection = replaceOnce(
    selection,
    `  const rectangle = await stagePoint(page, 350, 250);\n  await page.mouse.click(rectangle.x, rectangle.y);\n\n  const menu = page.getByRole("menu", { name: "Стиль линии" });`,
    `  const rectangle = await stagePoint(page, 350, 250);\n  await page.mouse.click(rectangle.x, rectangle.y);\n  await rightDoubleClickAt(page, rectangle);\n\n  const menu = page.getByRole("menu", { name: "Стиль линии" });`,
    "selection line style inspector",
  );
  await write(selectionPath, selection);

  const stylingPath = "tests/e2e/styling.spec.ts";
  let styling = await read(stylingPath);
  styling = replaceOnce(
    styling,
    `import { expect, test } from "@playwright/test";`,
    `import { expect, test } from "@playwright/test";\nimport { rightDoubleClickAt } from "./coordinate-plot-interaction.js";`,
    "styling helper import",
  );
  styling = replaceOnce(
    styling,
    `  await page.mouse.click(bounds.x + 320, bounds.y + 235);\n\n  await expect(`,
    `  const objectPoint = { x: bounds.x + 320, y: bounds.y + 235 };\n  await page.mouse.click(objectPoint.x, objectPoint.y);\n  await rightDoubleClickAt(page, objectPoint);\n\n  await expect(`,
    "styling explicit inspector",
  );
  await write(stylingPath, styling);

  const textPath = "tests/e2e/text-editing.spec.ts";
  let text = await read(textPath);
  text = replaceOnce(
    text,
    `import { expect, test } from "@playwright/test";`,
    `import { expect, test } from "@playwright/test";\nimport { rightDoubleClickAt } from "./coordinate-plot-interaction.js";`,
    "text helper import",
  );
  text = replaceOnce(
    text,
    `  await page.mouse.click(bounds.x + 330, bounds.y + 250);\n\n  const editor =`,
    `  const textPoint = { x: bounds.x + 330, y: bounds.y + 250 };\n  await page.mouse.click(textPoint.x, textPoint.y);\n  await rightDoubleClickAt(page, textPoint);\n\n  const editor =`,
    "text explicit inspector",
  );
  await write(textPath, text);

  const imagePath = "tests/e2e/image-import.spec.ts";
  let image = await read(imagePath);
  image = replaceOnce(
    image,
    `import { expect, test } from "@playwright/test";`,
    `import { expect, test } from "@playwright/test";\nimport { rightDoubleClickAt, stageCenter } from "./coordinate-plot-interaction.js";`,
    "image helper import",
  );
  image = replaceOnce(
    image,
    `  await expect(page.getByTestId("board-stage")).toHaveAttribute(\n    "data-transformable-count",\n    "1",\n  );\n  await page`,
    `  await expect(page.getByTestId("board-stage")).toHaveAttribute(\n    "data-transformable-count",\n    "1",\n  );\n  await rightDoubleClickAt(page, await stageCenter(page));\n  await page`,
    "image explicit inspector",
  );
  await write(imagePath, image);

  const smartInkPath = "tests/e2e/smart-ink.spec.ts";
  let smartInk = await read(smartInkPath);
  smartInk = replaceOnce(
    smartInk,
    `import { expect, test } from "@playwright/test";`,
    `import { expect, test } from "@playwright/test";\nimport { rightDoubleClickAt } from "./coordinate-plot-interaction.js";`,
    "smart ink helper import",
  );
  smartInk = replaceOnce(
    smartInk,
    `  await page.getByRole("button", { name: "Выделение (V)" }).click();\n  await page.mouse.click(center.x, center.y);\n  await page`,
    `  await page.getByRole("button", { name: "Выделение (V)" }).click();\n  await page.mouse.click(center.x, center.y);\n  await rightDoubleClickAt(page, center);\n  await page`,
    "smart ink explicit inspector",
  );
  await write(smartInkPath, smartInk);

  const layersPath = "tests/e2e/layers.spec.ts";
  let layers = await read(layersPath);
  layers = replaceOnce(
    layers,
    `import { expect, test } from "@playwright/test";`,
    `import { expect, test } from "@playwright/test";\nimport { rightDoubleClickAt } from "./coordinate-plot-interaction.js";`,
    "layers helper import",
  );
  layers = replaceOnce(
    layers,
    `  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");\n\n  await page.getByRole("button", { name: "Сгруппировать" }).click();`,
    `  await expect(page.getByTestId("selection-count")).toHaveText("2 выбрано");\n  await rightDoubleClickAt(page, { x: bounds.x + 490, y: bounds.y + 250 });\n\n  await page.getByRole("button", { name: "Сгруппировать" }).click();`,
    "layers explicit inspector",
  );
  await write(layersPath, layers);
}

async function patchUnitCoverage() {
  const appPath = "src/app/App.test.tsx";
  let app = await read(appPath);
  app = replaceOnce(
    app,
    `        <button\n          onClick={() => {\n            const objectId = props.scene.items[0]?.object.id;\n            if (objectId !== undefined) {\n              props.onObjectSettingsRequest?.(objectId);\n            }\n          }}\n          type="button"\n        >\n          Открыть настройки объекта\n        </button>`,
    `        <button\n          onClick={() => {\n            const objectId = props.scene.items[0]?.object.id;\n            if (objectId !== undefined) {\n              props.onObjectSettingsRequest?.(objectId);\n            }\n          }}\n          type="button"\n        >\n          Открыть настройки объекта\n        </button>\n        <button\n          onClick={() => {\n            const objectId = props.scene.items.find(\n              ({ object }) => object.kind === "math.coordinate-plot",\n            )?.object.id;\n            if (objectId !== undefined) {\n              props.coordinatePlotInteraction?.onViewportCommit?.(objectId, {\n                equalScale: true,\n                xMax: 8,\n                xMin: -12,\n                yMax: 11,\n                yMin: -9,\n              });\n            }\n          }}\n          type="button"\n        >\n          Переместить график\n        </button>`,
    "App mock plot pan button",
  );
  app = replaceOnce(
    app,
    `  it("moves a selection by keyboard and closes shortcut help with Escape", () => {`,
    `  it("commits a closed coordinate plot pan as one semantic history item", () => {\n    const onCommandCommitted = vi.fn();\n    render(<App onCommandCommitted={onCommandCommitted} />);\n\n    fireEvent.click(\n      screen.getByRole("button", {\n        name: "Создать координатную плоскость (G)",\n      }),\n    );\n    fireEvent.click(screen.getByRole("button", { name: "Переместить график" }));\n\n    expect(onCommandCommitted).toHaveBeenCalledTimes(2);\n    expect(onCommandCommitted.mock.calls[1]?.[0]).toMatchObject({\n      kind: "core.coordinate-plot.update",\n      replacement: {\n        coordinateViewport: { xMin: -12, xMax: 8, yMin: -9, yMax: 11 },\n      },\n    });\n    expect(screen.getByTestId("history-depth")).toHaveTextContent("2/0");\n  });\n\n  it("moves a selection by keyboard and closes shortcut help with Escape", () => {`,
    "App direct plot pan unit coverage",
  );
  await write(appPath, app);

  const rendererTestPath =
    "tests/unit/adapters/canvas-konva/coordinate-plot-renderer.test.tsx";
  let rendererTest = await read(rendererTestPath);
  rendererTest = replaceOnce(
    rendererTest,
    `  it("registers the object kind and forwards board zoom", () => {`,
    `  it("wires distinct settings, draft navigation and direct commit callbacks", () => {\n    const item: BoardRenderItem = { object: plot, transforms: [] };\n    const registry = createDefaultKonvaRendererRegistry();\n    const onSettingsRequest = () => undefined;\n    const onViewportChange = () => undefined;\n    const onViewportCommit = () => true;\n    const element = registry.render(item, {\n      coordinatePlot: {\n        activeObjectId: null,\n        onSettingsRequest,\n        onViewportChange,\n        onViewportCommit,\n        selectedSeriesId: null,\n      },\n      zoom: 2,\n    });\n\n    expect(element.type).toBe(CoordinatePlotRenderer);\n    expect(element.props.onSettingsRequest).toBeTypeOf("function");\n    expect(element.props.onViewportCommit).toBeTypeOf("function");\n    expect(element.props.onViewportChange).toBeUndefined();\n  });\n\n  it("registers the object kind and forwards board zoom", () => {`,
    "renderer callback unit coverage",
  );
  await write(rendererTestPath, rendererTest);
}

async function patchDocs() {
  const adr21Path = "docs/adr/ADR-021-coordinate-plot-right-button-pan.md";
  await write(
    adr21Path,
    `# ADR-021: Right-button pan inside coordinate plots\n\n- Status: Superseded by ADR-023\n- Date: 2026-08-02\n- Scope: pointer routing between a coordinate plot and the board viewport\n\nADR-021 originally limited internal right-button panning to a plot with an open editor. ADR-023 replaces that boundary after the closed-editor regression found in #67.\n`,
  );
  await write(
    "docs/adr/ADR-023-coordinate-plot-right-gesture-ownership.md",
    `# ADR-023: Coordinate-plot right-gesture ownership\n\n- Status: Accepted\n- Date: 2026-08-02\n- Scope: right-button click, double-click and drag routing\n\n## Decision\n\n1. A coordinate plot owns every right-button gesture that starts inside its rendered bounds.\n2. Movement above 8 screen pixels starts internal coordinate-viewport panning.\n3. A stationary second click within 450 ms opens plot settings.\n4. Plot events stop before the board-level recognizer.\n5. Closed-editor panning uses a transient renderer preview and one `core.coordinate-plot.update` command on pointerup.\n6. Editor-open panning updates the draft and remains part of the explicit save workflow.\n7. `BoardStage` activates the navigation tool only after a board right drag crosses the same movement threshold.\n8. Pointer cancellation, blur and unmount discard uncommitted previews and release capture.\n\n## Consequences\n\nThe settings panel and direct graph navigation have independent state. A stationary right click carries no tool-switch side effect. Each target scope has one gesture owner, so board panning and plot panning cannot start from the same pointerdown.\n\n## Verification\n\nChromium and Firefox cover closed-editor plot panning, atomic undo, unchanged board viewport and object position, stationary single-click behavior, right-double-click settings entry and background board panning.\n`,
  );
}

await patchBoardStage();
await patchRendererRegistry();
await patchDefaultRenderer();
await patchCoordinatePlotRenderer();
await patchApp();
await patchInteractionHelper();
await patchPlotAccessibility();
await patchPlotRightPanSpec();
await patchInspectorE2E();
await patchUnitCoverage();
await patchDocs();
await rm(".github/workflows/debug-object-settings-e2e.yml", { force: true });
await rm("scripts/debug-object-settings-e2e-trigger.txt", { force: true });
console.log("Applied coordinate-plot right-gesture hotfix");
