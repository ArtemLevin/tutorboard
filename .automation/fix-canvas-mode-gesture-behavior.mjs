import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const path = "src/adapters/canvas-konva/BoardStage.tsx";
let source = fs.readFileSync(path, "utf8");
source = replaceOnce(
  source,
  `  const primaryCanvasClickTimeoutRef = useRef<number | null>(null);
  const rightContextMenuTimeoutRef = useRef<number | null>(null);
`,
  `  const primaryCanvasClickTimeoutRef = useRef<number | null>(null);
  const primaryCanvasClickCandidateRef = useRef<{
    readonly point: Vec2;
    readonly timestamp: number;
  } | null>(null);
  const rightContextMenuTimeoutRef = useRef<number | null>(null);
`,
  "primary click candidate ref",
);
source = replaceOnce(
  source,
  `      if (panSessionRef.current?.pointerId === event.pointerId) {
        const session = panSessionRef.current;
        if (
          session.source === "right" &&
`,
  `      if (panSessionRef.current?.pointerId === event.pointerId) {
        const session = panSessionRef.current;
        if (session.source === "hand") {
          const point = clientPoint(event);
          const stationary =
            Math.hypot(
              point.x - session.startPoint.x,
              point.y - session.startPoint.y,
            ) <= rightDoubleClickDistancePx;
          if (stationary) {
            const previous = primaryCanvasClickCandidateRef.current;
            const elapsed =
              previous === null
                ? Number.POSITIVE_INFINITY
                : event.timeStamp - previous.timestamp;
            const withinDistance =
              previous !== null &&
              Math.hypot(
                point.x - previous.point.x,
                point.y - previous.point.y,
              ) <= rightDoubleClickDistancePx;
            if (
              previous !== null &&
              elapsed >= 0 &&
              elapsed <= canvasPrimaryClickDelayMs &&
              withinDistance
            ) {
              primaryCanvasClickCandidateRef.current = null;
              if (primaryCanvasClickTimeoutRef.current !== null) {
                window.clearTimeout(primaryCanvasClickTimeoutRef.current);
                primaryCanvasClickTimeoutRef.current = null;
              }
              onCanvasPrimaryDoubleClickRequest?.();
            } else {
              primaryCanvasClickCandidateRef.current = {
                point,
                timestamp: event.timeStamp,
              };
              if (primaryCanvasClickTimeoutRef.current !== null) {
                window.clearTimeout(primaryCanvasClickTimeoutRef.current);
              }
              primaryCanvasClickTimeoutRef.current = window.setTimeout(() => {
                primaryCanvasClickTimeoutRef.current = null;
                primaryCanvasClickCandidateRef.current = null;
                onCanvasPrimaryClickRequest?.();
              }, canvasPrimaryClickDelayMs);
            }
          }
        }
        if (
          session.source === "right" &&
`,
  "primary pointer-up gestures",
);
source = replaceOnce(
  source,
  `    const hitObjectId = isLassoAreaModifier
      ? null
      : objectIdFromTarget(event.target);
`,
  `    const hitTestStage = event.target.getStage();
    const hitObjectId = isLassoAreaModifier
      ? null
      : isTransformerTarget(event.target) && hitTestStage !== null
        ? objectIdBelowTransformer(
            hitTestStage,
            elementPoint(event.evt, hitTestStage.container()),
          )
        : objectIdFromTarget(event.target);
`,
  "transformer object hit test",
);
source = replaceOnce(
  source,
  `    const contextObjectId =
      hitObjectId !== null && selectedObjectIds.includes(hitObjectId)
        ? hitObjectId
        : null;
`,
  `    const contextObjectId = hitObjectId;
`,
  "right-click object context",
);
source = replaceOnce(
  source,
  `      canvasContextEligible:
        source === "right" &&
        !isTransformerTarget(event.target) &&
        (hitObjectId === null || contextObjectId !== null),
`,
  `      canvasContextEligible:
        source === "right" &&
        (hitObjectId === null || contextObjectId !== null),
`,
  "right-click transformer eligibility",
);
source = replaceOnce(
  source,
  `  useEffect(() => {
    if (primaryCanvasClickTimeoutRef.current !== null) {
      window.clearTimeout(primaryCanvasClickTimeoutRef.current);
      primaryCanvasClickTimeoutRef.current = null;
    }
  }, [drawingModeKey, panMode, selectionModeKey]);
`,
  `  useEffect(() => {
    primaryCanvasClickCandidateRef.current = null;
    if (primaryCanvasClickTimeoutRef.current !== null) {
      window.clearTimeout(primaryCanvasClickTimeoutRef.current);
      primaryCanvasClickTimeoutRef.current = null;
    }
  }, [drawingModeKey, panMode, selectionModeKey]);
`,
  "mode change candidate cleanup",
);
source = replaceOnce(
  source,
  `    finishSelection,
    predictedWorldSamples,
`,
  `    finishSelection,
    onCanvasPrimaryClickRequest,
    onCanvasPrimaryDoubleClickRequest,
    predictedWorldSamples,
`,
  "pointer effect dependencies",
);
fs.writeFileSync(path, source);
