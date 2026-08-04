import { readFile, rm, writeFile } from "node:fs/promises";

async function transform(path, callback) {
  const source = await readFile(path, "utf8");
  const output = callback(source);
  if (output === source) {
    throw new Error(`Transformation produced no changes: ${path}`);
  }
  await writeFile(path, output);
}

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing integration anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Ambiguous integration anchor: ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

await transform("src/adapters/canvas-konva/pointer-samples.ts", (source) => {
  source = replaceOnce(
    source,
    "const maximumCoalescedPointerEvents = 256;\n",
    "const maximumCoalescedPointerEvents = 256;\nconst maximumPredictedPointerEvents = 64;\n",
    "predicted limit",
  );
  source = replaceOnce(
    source,
    "export { maximumCoalescedPointerEvents };",
    `type PointerEventWithPrediction = PointerEvent & {
  readonly getPredictedEvents?: () => readonly PointerEvent[];
};

/**
 * Returns a bounded prediction tail for transient rendering. Predictions are
 * visual hints and never enter BoardDocument or drawing reducers.
 */
export function collectPredictedPointerEvents(
  event: PointerEvent,
): readonly PointerEvent[] {
  const candidateEvent = event as PointerEventWithPrediction;
  if (typeof candidateEvent.getPredictedEvents !== "function") return [];

  let predicted: readonly unknown[];
  try {
    const candidate = candidateEvent.getPredictedEvents() as unknown;
    predicted = Array.isArray(candidate) ? candidate : [];
  } catch {
    return [];
  }

  const output: PointerEvent[] = [];
  for (const sample of predicted.slice(-maximumPredictedPointerEvents)) {
    if (pointerEventLike(sample) && sample.pointerId === event.pointerId) {
      appendUnique(output, sample);
    }
  }
  return output;
}

export function pointerEventInputTimestampMs(
  event: PointerEvent,
  nowMs = performance.now(),
): number {
  const timestampMs = event.timeStamp;
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(nowMs - timestampMs) > 60_000
  ) {
    return nowMs;
  }
  return Math.min(nowMs, timestampMs);
}

export { maximumCoalescedPointerEvents, maximumPredictedPointerEvents };`,
    "predicted collector",
  );
  return source;
});

await transform("src/adapters/canvas-konva/public.ts", (source) => {
  source = replaceOnce(
    source,
    `export {
  collectCoalescedPointerEvents,
  maximumCoalescedPointerEvents,
} from "./pointer-samples";`,
    `export {
  collectCoalescedPointerEvents,
  collectPredictedPointerEvents,
  maximumCoalescedPointerEvents,
  maximumPredictedPointerEvents,
  pointerEventInputTimestampMs,
} from "./pointer-samples";
export {
  createKonvaWetInkSurface,
  maximumWetInkActualPoints,
  maximumWetInkPredictedPoints,
  WetInkLatencyTracker,
  WetInkRenderer,
  wetInkLatencyWindowSize,
  type WetInkFrame,
  type WetInkFrameClock,
  type WetInkFrameReport,
  type WetInkLatencySnapshot,
  type WetInkRendererOptions,
  type WetInkSample,
  type WetInkStyle,
  type WetInkSurface,
} from "./wet-ink-renderer";`,
    "canvas public exports",
  );
  return source;
});

await transform("src/adapters/canvas-konva/BoardStage.tsx", (source) => {
  source = replaceOnce(
    source,
    `import { collectCoalescedPointerEvents } from "./pointer-samples";`,
    `import {
  collectCoalescedPointerEvents,
  collectPredictedPointerEvents,
  pointerEventInputTimestampMs,
} from "./pointer-samples";
import {
  createKonvaWetInkSurface,
  WetInkRenderer,
  type WetInkSample,
  type WetInkStyle,
} from "./wet-ink-renderer";`,
    "BoardStage wet ink imports",
  );
  source = replaceOnce(
    source,
    `export interface WorldPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
  readonly pressure: number;
}
`,
    `export interface WorldPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
  readonly pressure: number;
}

interface TimedWorldPointerSample extends WorldPointerSample, WetInkSample {}
`,
    "timed world pointer sample",
  );
  source = replaceOnce(
    source,
    `  readonly onWorldPointerFinish: (sample: WorldPointerSample) => void;
  readonly onWorldPointerMove: (sample: WorldPointerSample) => void;
  readonly onWorldPointerHover?: (point: Vec2) => void;`,
    `  readonly onWorldPointerFinish: (sample: WorldPointerSample) => void;
  readonly onWorldPointerMove: (sample: WorldPointerSample) => void;
  readonly onWorldPointerBatch?:
    ((samples: readonly WorldPointerSample[]) => void) | undefined;
  readonly onWorldPointerHover?: (point: Vec2) => void;`,
    "world pointer batch prop",
  );
  source = replaceOnce(
    source,
    `  readonly transformableObjectIds?: readonly BoardObjectId[];
  readonly onViewportCommit: (viewport: ViewportState) => void;`,
    `  readonly transformableObjectIds?: readonly BoardObjectId[];
  readonly wetInkStyle?: WetInkStyle | null;
  readonly onViewportCommit: (viewport: ViewportState) => void;`,
    "wet ink style prop",
  );
  source = replaceOnce(
    source,
    `  onWorldPointerFinish,
  onWorldPointerMove,
  onWorldPointerHover,`,
    `  onWorldPointerFinish,
  onWorldPointerMove,
  onWorldPointerBatch,
  onWorldPointerHover,`,
    "batch prop destructuring",
  );
  source = replaceOnce(
    source,
    `  transformableObjectIds = [],
}: BoardStageProps) {`,
    `  transformableObjectIds = [],
  wetInkStyle = null,
}: BoardStageProps) {`,
    "wet ink style destructuring",
  );
  source = replaceOnce(
    source,
    `  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);`,
    `  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const wetInkLayerRef = useRef<Konva.Layer>(null);
  const wetInkRendererRef = useRef<WetInkRenderer | null>(null);
  const pendingWorldPointerMovesRef = useRef<WorldPointerSample[]>([]);
  const worldPointerMoveFrameRef = useRef<number | null>(null);`,
    "wet ink refs",
  );
  source = replaceOnce(
    source,
    `  const worldPointerCallbacksRef = useRef({
    cancel: onWorldPointerCancel,
    finish: onWorldPointerFinish,
    move: onWorldPointerMove,
    start: onWorldPointerStart,
  });`,
    `  const worldPointerCallbacksRef = useRef({
    batch: onWorldPointerBatch,
    cancel: onWorldPointerCancel,
    finish: onWorldPointerFinish,
    move: onWorldPointerMove,
    start: onWorldPointerStart,
  });`,
    "world pointer callback ref",
  );
  source = replaceOnce(
    source,
    `  const size = useElementSize(rootRef);
  const visibleItemBatches = useMemo(`,
    `  const size = useElementSize(rootRef);

  useLayoutEffect(() => {
    const layer = wetInkLayerRef.current;
    const root = rootRef.current;
    if (layer === null || root === null) return;
    const renderer = new WetInkRenderer(createKonvaWetInkSurface(layer), {
      onClear: () => {
        root.dataset.wetInkActive = "false";
        root.dataset.wetInkActualPoints = "0";
        root.dataset.wetInkPredictedPoints = "0";
      },
      onFrame: (report) => {
        root.dataset.wetInkActualPoints = String(report.actualPointCount);
        root.dataset.wetInkFrameCount = String(report.frameCount);
        root.dataset.wetInkLatencyCount = String(report.latency.count);
        root.dataset.wetInkLatencyLastMs = report.latency.lastMs.toFixed(2);
        root.dataset.wetInkLatencyMeanMs = report.latency.meanMs.toFixed(2);
        root.dataset.wetInkLatencyP95Ms = report.latency.p95Ms.toFixed(2);
        root.dataset.wetInkPredictedPoints = String(
          report.predictedPointCount,
        );
      },
    });
    wetInkRendererRef.current = renderer;
    root.dataset.wetInkActive = "false";
    root.dataset.wetInkFrameCount = "0";
    root.dataset.wetInkLatencyCount = "0";
    root.dataset.wetInkLayer = "ready";
    return () => {
      renderer.destroy();
      if (wetInkRendererRef.current === renderer) {
        wetInkRendererRef.current = null;
      }
      root.dataset.wetInkActive = "false";
      root.dataset.wetInkLayer = "destroyed";
    };
  }, []);

  useLayoutEffect(() => {
    wetInkRendererRef.current?.setViewport(previewViewport);
  }, [previewViewport]);

  const visibleItemBatches = useMemo(`,
    "wet ink renderer lifecycle",
  );
  source = replaceOnce(
    source,
    `    worldPointerCallbacksRef.current = {
      cancel: onWorldPointerCancel,
      finish: onWorldPointerFinish,
      move: onWorldPointerMove,
      start: onWorldPointerStart,
    };
  }, [
    onWorldPointerCancel,
    onWorldPointerFinish,
    onWorldPointerMove,
    onWorldPointerStart,
  ]);`,
    `    worldPointerCallbacksRef.current = {
      batch: onWorldPointerBatch,
      cancel: onWorldPointerCancel,
      finish: onWorldPointerFinish,
      move: onWorldPointerMove,
      start: onWorldPointerStart,
    };
  }, [
    onWorldPointerBatch,
    onWorldPointerCancel,
    onWorldPointerFinish,
    onWorldPointerMove,
    onWorldPointerStart,
  ]);`,
    "world pointer callback sync",
  );
  source = replaceOnce(
    source,
    `  const worldSample = useCallback(
    (event: PointerEvent, session: DrawingSession): WorldPointerSample => ({
      point: screenToWorld(
        elementPoint(event, session.captureElement),
        session.viewport,
      ),
      pointerId: event.pointerId,
      pressure: Number.isFinite(event.pressure)
        ? Math.min(1, Math.max(0, event.pressure))
        : 0,
    }),
    [],
  );`,
    `  const worldSample = useCallback(
    (event: PointerEvent, session: DrawingSession): TimedWorldPointerSample => ({
      inputTimestampMs: pointerEventInputTimestampMs(event),
      point: screenToWorld(
        elementPoint(event, session.captureElement),
        session.viewport,
      ),
      pointerId: event.pointerId,
      pressure: Number.isFinite(event.pressure)
        ? Math.min(1, Math.max(0, event.pressure))
        : 0,
    }),
    [],
  );`,
    "timed world sample",
  );
  source = replaceOnce(
    source,
    `    ): readonly WorldPointerSample[] =>
      collectCoalescedPointerEvents(event).map((sample) =>
        worldSample(sample, session),
      ),
    [worldSample],
  );

  const emitWorldPointerMoves = useCallback(
    (samples: readonly WorldPointerSample[]) => {
      for (const sample of samples) {
        worldPointerCallbacksRef.current.move(sample);
      }
    },
    [],
  );`,
    `    ): readonly TimedWorldPointerSample[] =>
      collectCoalescedPointerEvents(event).map((sample) =>
        worldSample(sample, session),
      ),
    [worldSample],
  );

  const predictedWorldSamples = useCallback(
    (
      event: PointerEvent,
      session: DrawingSession,
    ): readonly TimedWorldPointerSample[] =>
      collectPredictedPointerEvents(event).map((sample) =>
        worldSample(sample, session),
      ),
    [worldSample],
  );

  const discardWorldPointerMoves = useCallback(() => {
    if (worldPointerMoveFrameRef.current !== null) {
      cancelAnimationFrame(worldPointerMoveFrameRef.current);
      worldPointerMoveFrameRef.current = null;
    }
    pendingWorldPointerMovesRef.current = [];
  }, []);

  const flushWorldPointerMoves = useCallback(() => {
    if (worldPointerMoveFrameRef.current !== null) {
      cancelAnimationFrame(worldPointerMoveFrameRef.current);
      worldPointerMoveFrameRef.current = null;
    }
    const samples = pendingWorldPointerMovesRef.current;
    pendingWorldPointerMovesRef.current = [];
    if (samples.length === 0) return;
    const batch = worldPointerCallbacksRef.current.batch;
    if (batch !== undefined) {
      batch(samples);
      return;
    }
    for (const sample of samples) {
      worldPointerCallbacksRef.current.move(sample);
    }
  }, []);

  const enqueueWorldPointerMoves = useCallback(
    (samples: readonly WorldPointerSample[]) => {
      if (samples.length === 0) return;
      pendingWorldPointerMovesRef.current.push(...samples);
      if (worldPointerMoveFrameRef.current !== null) return;
      worldPointerMoveFrameRef.current = requestAnimationFrame(() => {
        flushWorldPointerMoves();
      });
    },
    [flushWorldPointerMoves],
  );`,
    "world pointer frame batching",
  );
  source = replaceOnce(
    source,
    `      if (commit && event !== undefined) {
        const samples = worldSamples(event, session);
        const finalSample = samples.at(-1);
        if (finalSample !== undefined) {
          emitWorldPointerMoves(samples.slice(0, -1));
          worldPointerCallbacksRef.current.finish(finalSample);
        } else {
          worldPointerCallbacksRef.current.finish(worldSample(event, session));
        }
      } else {
        worldPointerCallbacksRef.current.cancel(session.pointerId);
      }
    },
    [emitWorldPointerMoves, releaseCapture, worldSample, worldSamples],
  );`,
    `      if (commit && event !== undefined) {
        const samples = worldSamples(event, session);
        const finalSample = samples.at(-1);
        wetInkRendererRef.current?.finish(samples, []);
        if (finalSample !== undefined) {
          enqueueWorldPointerMoves(samples.slice(0, -1));
          flushWorldPointerMoves();
          worldPointerCallbacksRef.current.finish(finalSample);
        } else {
          flushWorldPointerMoves();
          worldPointerCallbacksRef.current.finish(worldSample(event, session));
        }
      } else {
        discardWorldPointerMoves();
        wetInkRendererRef.current?.cancel();
        worldPointerCallbacksRef.current.cancel(session.pointerId);
      }
    },
    [
      discardWorldPointerMoves,
      enqueueWorldPointerMoves,
      flushWorldPointerMoves,
      releaseCapture,
      worldSample,
      worldSamples,
    ],
  );`,
    "finish drawing batching",
  );
  source = replaceOnce(
    source,
    `        event.preventDefault();
        emitWorldPointerMoves(worldSamples(event, drawingSession));
        return;`,
    `        event.preventDefault();
        const samples = worldSamples(event, drawingSession);
        wetInkRendererRef.current?.append(
          samples,
          predictedWorldSamples(event, drawingSession),
        );
        enqueueWorldPointerMoves(samples);
        return;`,
    "pointer move wet ink",
  );
  source = replaceOnce(
    source,
    `    emitWorldPointerMoves,
    finishDrawing,`,
    `    enqueueWorldPointerMoves,
    finishDrawing,`,
    "pointer effect enqueue dependency",
  );
  source = replaceOnce(
    source,
    `    selectionWorldSample,
    worldSamples,
  ]);`,
    `    predictedWorldSamples,
    selectionWorldSample,
    worldSamples,
  ]);`,
    "pointer effect prediction dependency",
  );
  source = replaceOnce(
    source,
    `      rightClickCandidateRef.current = null;
    },
    [releaseCapture],
  );`,
    `      discardWorldPointerMoves();
      rightClickCandidateRef.current = null;
    },
    [discardWorldPointerMoves, releaseCapture],
  );`,
    "unmount batch cleanup",
  );
  source = replaceOnce(
    source,
    `      drawingSessionRef.current = session;
      setIsDrawing(true);
      worldPointerCallbacksRef.current.start(worldSample(event.evt, session));
      return;`,
    `      drawingSessionRef.current = session;
      setIsDrawing(true);
      const startSample = worldSample(event.evt, session);
      if (wetInkStyle !== null) {
        rootRef.current?.setAttribute("data-wet-ink-active", "true");
        wetInkRendererRef.current?.begin(
          startSample,
          wetInkStyle,
          session.viewport,
        );
      }
      worldPointerCallbacksRef.current.start(startSample);
      return;`,
    "wet ink start",
  );
  source = replaceOnce(
    source,
    `        </Layer>
        <Layer listening={false}>
          <Group
            scaleX={previewViewport.zoom}`,
    `        </Layer>
        <Layer ref={wetInkLayerRef} listening={false} />
        <Layer listening={false}>
          <Group
            scaleX={previewViewport.zoom}`,
    "transient wet ink layer",
  );
  return source;
});

await transform("src/app/App.tsx", (source) => {
  source = replaceOnce(
    source,
    `  createAddDrawingObjectCommand,
  drawingTools,`,
    `  createAddDrawingObjectCommand,
  drawingStyleDefaults,
  drawingTools,`,
    "drawing style defaults import",
  );
  source = replaceOnce(
    source,
    `  const previewItems = useMemo<readonly BoardRenderItem[]>(
    () => [
      ...(drawingPreview === null
        ? []
        : [{ object: drawingPreview, transforms: [] }]),
      ...handwrittenFunctionPreviewItems,
    ],
    [drawingPreview, handwrittenFunctionPreviewItems],
  );`,
    `  const previewItems = useMemo<readonly BoardRenderItem[]>(
    () => [
      ...(drawingPreview === null
        ? []
        : [{ object: drawingPreview, transforms: [] }]),
      ...handwrittenFunctionPreviewItems,
    ],
    [drawingPreview, handwrittenFunctionPreviewItems],
  );
  const wetInkStyle = useMemo(() => {
    const style =
      activeTool === "drawing.pen" || activeTool === "drawing.smart-ink"
        ? styleFor(activeTool)
        : activeTool === handwrittenFunctionToolId
          ? drawingStyleDefaults.pen
          : null;
    if (style === null) return null;
    return {
      opacity: style.opacity,
      stroke: style.stroke ?? drawingStyleDefaults.pen.stroke,
      strokeWidth: style.strokeWidth,
    };
  }, [activeTool, styleFor]);`,
    "App wet ink style",
  );
  source = replaceOnce(
    source,
    `  const finishDrawing = useCallback(
    (sample: WorldPointerSample) => {`,
    `  const moveDrawingBatch = useCallback(
    (samples: readonly WorldPointerSample[]) => {
      if (samples.length === 0) return;
      if (activeTool === laserToolId) {
        const finalSample = samples.at(-1)!;
        setLaserPoint(finalSample.point);
        setLaserTrailPoints((points) =>
          samples.reduce(
            (trail, sample) => appendLaserTrailPoint(trail, sample.point),
            points,
          ),
        );
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        let state = handwrittenFunctionStateRef.current;
        let diagnostic: HandwrittenFunctionSessionDiagnosticCode | null = null;
        for (const sample of samples) {
          const result = reduceHandwrittenFunctionSession(state, {
            kind: "append-point",
            point: {
              timeMs: performance.now(),
              x: sample.point.x,
              y: sample.point.y,
            },
            pointerId: sample.pointerId,
          });
          state = result.state;
          diagnostic = result.diagnostic ?? diagnostic;
        }
        handwrittenFunctionStateRef.current = state;
        setHandwrittenFunctionState(state);
        if (diagnostic !== null) {
          setHandwrittenFunctionDiagnostic(
            handwrittenSessionDiagnosticMessage(diagnostic),
          );
        }
        return;
      }

      let state = drawingStateRef.current;
      let diagnostic: string | null = null;
      for (const sample of samples) {
        const result = reduceDrawingInteraction(state, {
          kind: "move",
          point: sample.point,
          pointerId: sample.pointerId,
        });
        state = result.state;
        diagnostic = result.diagnostic;
      }
      drawingStateRef.current = state;
      setDrawingState(state);
      setDrawingDiagnostic(diagnostic);
    },
    [activeTool],
  );

  const finishDrawing = useCallback(
    (sample: WorldPointerSample) => {`,
    "App batched move callback",
  );
  source = replaceOnce(
    source,
    `          onWorldPointerCancel={cancelDrawing}
          onWorldPointerFinish={finishDrawing}
          onWorldPointerMove={moveDrawing}`,
    `          onWorldPointerBatch={moveDrawingBatch}
          onWorldPointerCancel={cancelDrawing}
          onWorldPointerFinish={finishDrawing}
          onWorldPointerMove={moveDrawing}`,
    "BoardStage batch callback",
  );
  source = replaceOnce(
    source,
    `          transformableObjectIds={transformableObjectIds}
        />`,
    `          transformableObjectIds={transformableObjectIds}
          wetInkStyle={wetInkStyle}
        />`,
    "BoardStage wet ink style",
  );
  return source;
});

await rm(".automation/apply-wet-ink-pr2.mjs");
await rm(".github/workflows/apply-wet-ink-pr2.yml");
