# TutorBoard PR3 reference map
main_sha=493438a8b4a19e92c698599c1551a71407a89703
src/modules/smart-ink/composite-recognizer.ts:5:  PenStrokeObject,
src/modules/smart-ink/composite-recognizer.ts:36:  readonly object: PenStrokeObject | RectangleObject;
src/modules/smart-ink/composite-recognizer.ts:120:    ...points.map((point) => Math.hypot(point.x, point.y)),
src/modules/smart-ink/composite-recognizer.ts:145:  if (object.kind !== "drawing.pen-stroke") return null;
src/modules/smart-ink/composite-recognizer.ts:146:  const vertices = uniqueClosedVertices(object.points);
src/modules/smart-ink/commands.ts:3:  PenStrokeObject,
src/modules/smart-ink/commands.ts:36:  object: PenStrokeObject | undefined,
src/modules/smart-ink/arrow-recognizer.ts:62:  const result: Vec2[] = [{ ...points[0]! }];
src/modules/smart-ink/arrow-recognizer.ts:90:  result.push({ ...points.at(-1)! });
src/modules/smart-ink/arrow-recognizer.ts:208:      Math.max(...points.map(({ x }) => x)) -
src/modules/smart-ink/arrow-recognizer.ts:209:        Math.min(...points.map(({ x }) => x)),
src/modules/smart-ink/arrow-recognizer.ts:210:      Math.max(...points.map(({ y }) => y)) -
src/modules/smart-ink/arrow-recognizer.ts:211:        Math.min(...points.map(({ y }) => y)),
src/modules/smart-ink/arrow-recognizer.ts:280:  const reverse = fitDirection([...points].reverse());
src/modules/smart-ink/proposal.ts:4:  PenStrokeObject,
src/modules/smart-ink/proposal.ts:52:  readonly original: PenStrokeObject;
src/modules/smart-ink/proposal.ts:86:function strokeWorldPoints(stroke: PenStrokeObject): readonly Vec2[] {
src/modules/smart-ink/proposal.ts:87:  return stroke.points.map((point) => {
src/modules/smart-ink/proposal.ts:103:  stroke: PenStrokeObject,
src/modules/smart-ink/proposal.ts:108:  readonly id: PenStrokeObject["id"];
src/modules/smart-ink/proposal.ts:131:  stroke: PenStrokeObject,
src/modules/smart-ink/proposal.ts:143:        kind: "drawing.pen-stroke",
src/modules/smart-ink/proposal.ts:222:        kind: "drawing.pen-stroke",
src/modules/smart-ink/proposal.ts:290:  stroke: PenStrokeObject,
src/modules/smart-ink/proposal.ts:316:    sourcePointCount: stroke.points.length,
src/modules/server-sync/sync.ts:494:            schemaVersion: "1.1",
src/modules/document-transfer/public.ts:9:  renderBoardSnapshotPng,
src/modules/document-transfer/public.ts:10:  renderBoardSnapshotPdf,
src/modules/document-transfer/public.ts:11:  renderBoardSnapshotSvg,
src/modules/document-transfer/snapshot.ts:51:    case "drawing.pen-stroke": {
src/modules/document-transfer/snapshot.ts:52:      const first = object.points[0];
src/modules/document-transfer/snapshot.ts:53:      const last = object.points.at(-1);
src/modules/document-transfer/snapshot.ts:59:        ? object.points
src/modules/document-transfer/snapshot.ts:60:        : buildSmoothStrokePoints(object.points, { zoom });
src/modules/document-transfer/snapshot.ts:92:export function renderBoardSnapshotSvg(
src/modules/document-transfer/snapshot.ts:118:export async function renderBoardSnapshotPng(
src/modules/document-transfer/snapshot.ts:124:  const svg = renderBoardSnapshotSvg(document, { height, width });
src/modules/document-transfer/snapshot.ts:158:export async function renderBoardSnapshotPdf(
src/modules/document-transfer/snapshot.ts:165:  const png = await renderBoardSnapshotPng(document, { height, width });
src/modules/text-shape-placement/figure-actions.ts:111:  if (object.kind === "drawing.pen-stroke") {
src/modules/text-shape-placement/figure-actions.ts:114:      object.points.map((item) => ({
src/modules/text-shape-placement/figure-actions.ts:128:      object.kind === "drawing.pen-stroke")
src/modules/text-shape-placement/templates.ts:641:    const first = item.points[0]!;
src/modules/text-shape-placement/templates.ts:650:      kind: "drawing.pen-stroke",
src/modules/text-shape-placement/templates.ts:651:      points: item.points.map((point) => ({
src/modules/drawing/interaction.ts:121:  return [...points, point];
src/modules/drawing/interaction.ts:143:    appendPenPoint(state.points, point),
src/modules/drawing/interaction.ts:152:    kind: "drawing.pen-stroke",
src/modules/drawing/interaction.ts:248:        kind: "drawing.pen-stroke",
src/modules/drawing/interaction.ts:266:      return state.points.length < 2
src/modules/drawing/interaction.ts:270:            kind: "drawing.pen-stroke",
src/modules/drawing/interaction.ts:271:            points: state.points,
src/modules/drawing/interaction.ts:367:          points: appendPenPoint(state.points, action.point),
src/modules/selection/interaction.ts:165:    return [...points.slice(0, -1), point];
src/modules/selection/interaction.ts:167:  return [...points, point];
src/modules/selection/interaction.ts:207:  return state.interaction.kind === "lasso" ? state.interaction.points : null;
src/modules/selection/interaction.ts:314:          points: appendLassoPoint(interaction.points, action.point),
src/modules/selection/geometry.ts:73:    case "drawing.pen-stroke": {
src/modules/selection/geometry.ts:74:      const points = object.points.filter(finitePoint);
src/modules/selection/geometry.ts:132:    points: local.points.map((point) =>
src/modules/selection/geometry.ts:142:  const points = localSelectionPath(object).points;
src/modules/selection/geometry.ts:293:  if (path.points.length < 2) {
src/modules/selection/geometry.ts:297:  for (let index = 1; index < path.points.length; index += 1) {
src/modules/selection/geometry.ts:298:    segments.push([path.points[index - 1]!, path.points[index]!]);
src/modules/selection/geometry.ts:301:    segments.push([path.points.at(-1)!, path.points[0]!]);
src/modules/selection/geometry.ts:310:  if (path.points.some((point) => pointInPolygon(point, polygon))) {
src/modules/selection/geometry.ts:315:    polygon.some((point) => pointInPolygon(point, path.points))
src/modules/smart-ink-spike/corpus.ts:165:    !Array.isArray(input.points) ||
src/modules/smart-ink-spike/corpus.ts:166:    input.points.length < 2 ||
src/modules/smart-ink-spike/corpus.ts:167:    input.points.length > maximumCorpusPointsPerSample
src/modules/smart-ink-spike/corpus.ts:174:    input.points.some(
src/modules/smart-ink-spike/corpus.ts:414:    const proposal = recognizeSmartInkStroke(sample.id, sample.points, options);
src/modules/smart-ink-spike/recognizer.ts:92:  const result: Vec2[] = [{ ...points[0]! }];
src/modules/smart-ink-spike/recognizer.ts:121:  result.push({ ...points.at(-1)! });
src/modules/smart-ink-spike/recognizer.ts:235:  const sorted = [...points].sort((left, right) =>
src/modules/smart-ink-spike/recognizer.ts:324:  const principal = principalAxis(analysis.points);
src/modules/smart-ink-spike/recognizer.ts:327:  for (const point of analysis.points) {
src/modules/smart-ink-spike/recognizer.ts:343:    polylineRootMeanSquareError(analysis.points, [start, end], false) /
src/modules/smart-ink-spike/recognizer.ts:413:  const mean = centroid(analysis.points);
src/modules/smart-ink-spike/recognizer.ts:419:  for (const point of analysis.points) {
src/modules/smart-ink-spike/recognizer.ts:438:  const distances = analysis.points.map((point) => distance(point, center));
src/modules/smart-ink-spike/recognizer.ts:473:  const principal = principalAxis(analysis.points);
src/modules/smart-ink-spike/recognizer.ts:474:  const local = analysis.points.map((point) =>
src/modules/smart-ink-spike/recognizer.ts:582:  const fitted = orientedRectangle(analysis.points);
src/modules/smart-ink-spike/recognizer.ts:584:    polylineRootMeanSquareError(analysis.points, fitted.vertices, true) /
src/modules/smart-ink-spike/recognizer.ts:620:  const hull = convexHull(analysis.points);
src/modules/smart-ink-spike/recognizer.ts:623:    analysis.points[0]!,
src/modules/smart-ink-spike/recognizer.ts:624:    analysis.points[Math.floor(analysis.points.length / 3)]!,
src/modules/smart-ink-spike/recognizer.ts:625:    analysis.points[Math.floor((analysis.points.length * 2) / 3)]!,
src/modules/smart-ink-spike/recognizer.ts:639:    polylineRootMeanSquareError(analysis.points, vertices, true) /
src/modules/smart-ink-spike/calibration.ts:234:    const proposal = recognizeSmartInkStroke(sample.id, sample.points, {
src/modules/handwritten-function/session.ts:45:  return strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
src/modules/handwritten-function/session.ts:75:  const previous = active.points.at(-1);
src/modules/handwritten-function/session.ts:77:    return { diagnostic: null, points: active.points };
src/modules/handwritten-function/session.ts:80:    active.points.length >= handwrittenFunctionLimits.maximumPointsPerStroke ||
src/modules/handwritten-function/session.ts:81:    committedPointCount(state.strokes) + active.points.length >=
src/modules/handwritten-function/session.ts:84:    return { diagnostic: "handwriting.point-limit", points: active.points };
src/modules/handwritten-function/session.ts:86:  return { diagnostic: null, points: [...active.points, point] };
src/modules/handwritten-function/session.ts:107:    for (const point of stroke.points) {
src/modules/handwritten-function/session.ts:240:          activeStroke: { ...state.activeStroke, points: appended.points },
src/modules/handwritten-function/session.ts:258:      if (!strokeHasGeometry(appended.points)) {
src/modules/handwritten-function/session.ts:274:            { id: state.activeStroke.id, points: appended.points },
src/modules/handwritten-function/recognition.ts:31:      points: stroke.points.map((point) => ({
src/modules/handwritten-function/fake-recognizer.ts:33:      points: stroke.points.map((point) => ({ ...point })),
src/modules/clipboard/public.ts:2:  boardClipboardSchemaVersion,
src/modules/clipboard/clipboard.ts:17:export const boardClipboardSchemaVersion = "1.1" as const;
src/modules/clipboard/clipboard.ts:25:  readonly schemaVersion: typeof boardClipboardSchemaVersion;
src/modules/clipboard/clipboard.ts:110:      schemaVersion: boardClipboardSchemaVersion,
src/modules/geometry-import/candidate-mapper.ts:155:      startPointGirId: segment.points[0],
src/modules/geometry-import/candidate-mapper.ts:156:      endPointGirId: segment.points[1],
src/modules/geometry-import/candidate-mapper.ts:168:    const key = pairKey(segment.points[0], segment.points[1]);
src/modules/geometry-import/reference-resolver.ts:138:        requireDistinct(value.points, diagnostics, value.id, `${base}/points`);
src/modules/geometry-import/reference-resolver.ts:139:        value.points.forEach((targetId, targetIndex) =>
src/modules/geometry-import/reference-resolver.ts:233:        requireDistinct(value.points, diagnostics, value.id, `${base}/points`);
src/modules/geometry-import/reference-resolver.ts:234:        value.points.forEach((targetId, targetIndex) =>
src/modules/geometry-import/reference-resolver.ts:302:        requireDistinct(value.points, diagnostics, value.id, `${base}/points`);
src/modules/geometry-import/reference-resolver.ts:303:        value.points.forEach((targetId, targetIndex) =>
src/modules/geometry-import/generated/gir.validators.mjs:289:if(data1.points === undefined){
src/modules/geometry-import/generated/gir.validators.mjs:323:if(data1.points !== undefined){
src/modules/geometry-import/generated/gir.validators.mjs:324:let data8 = data1.points;
src/modules/geometry-import/generated/gir.validators.mjs:472:if(data1.points === undefined){
src/modules/geometry-import/generated/gir.validators.mjs:506:if(data1.points !== undefined){
src/modules/geometry-import/generated/gir.validators.mjs:507:let data13 = data1.points;
src/modules/geometry-import/generated/gir.validators.mjs:3216:if(data89.points === undefined){
src/modules/geometry-import/generated/gir.validators.mjs:3250:if(data89.points !== undefined){
src/modules/geometry-import/generated/gir.validators.mjs:3251:let data94 = data89.points;
src/modules/geometry-import/generated/gir.validators.mjs:3379:if(data89.points === undefined){
src/modules/geometry-import/generated/gir.validators.mjs:3413:if(data89.points !== undefined){
src/modules/geometry-import/generated/gir.validators.mjs:3414:let data99 = data89.points;
src/modules/geometry-import/generated/gir.validators.mjs:4021:if(data89.points === undefined){
src/modules/geometry-import/generated/gir.validators.mjs:4055:if(data89.points !== undefined){
src/modules/geometry-import/generated/gir.validators.mjs:4056:let data118 = data89.points;
src/modules/geometry-import/layout-import.ts:110:  const point = layout.points[candidate.girEntityId];
src/modules/geometry-import/layout-import.ts:168:  const start = layout.points[segment.start];
src/modules/geometry-import/layout-import.ts:169:  const end = layout.points[segment.end];
src/modules/geometry-import/layout-import.ts:219:  const target = label === undefined ? undefined : layout.points[label.target];
src/shared/stroke-smoothing.ts:164:    [...points.slice(oppositeIndex), first],
src/shared/stroke-smoothing.ts:274:  if (points.length <= 2) return [...points];
src/app/SyncedApp.tsx:24:  renderBoardSnapshotPng,
src/app/SyncedApp.tsx:25:  renderBoardSnapshotPdf,
src/app/SyncedApp.tsx:26:  renderBoardSnapshotSvg,
src/app/SyncedApp.tsx:309:      const svg = renderBoardSnapshotSvg(state.document);
src/app/SyncedApp.tsx:310:      const png = await renderBoardSnapshotPng(state.document);
src/app/SyncedApp.tsx:422:          void renderBoardSnapshotPdf(document)
src/app/smart-ink-diagnostics-export.test.ts:91:        replacementKind: "drawing.pen-stroke",
src/app/App.tsx:47:  type PenStrokeObject,
src/app/App.tsx:233:  return [...points.slice(-(laserTrailMaximumPoints - 1)), point];
src/app/App.tsx:387:  ] = useState<readonly PenStrokeObject[] | null>(null);
src/app/App.tsx:389:    readonly PenStrokeObject[] | null
src/app/App.tsx:536:    return active !== null && active.points.length >= 2
src/app/App.tsx:539:          { id: active.id, points: active.points },
src/app/App.tsx:1213:          result.completedObject.kind === "drawing.pen-stroke"
src/app/App.tsx:1220:              current?.kind === "drawing.pen-stroke" &&
src/app/App.tsx:1297:    ): readonly PenStrokeObject[] | null => {
src/app/App.tsx:1330:      state.activeStroke.points.length >= 2
src/app/App.tsx:1332:      const point = state.activeStroke.points.at(-1)!;
src/app/App.tsx:2595:                  ...interaction.points,
src/app/SmartInkDiagnosticsPanel.test.tsx:4:import { boardObjectId, type PenStrokeObject } from "../core/public";
src/app/SmartInkDiagnosticsPanel.test.tsx:8:function lineStroke(): PenStrokeObject {
src/app/SmartInkDiagnosticsPanel.test.tsx:12:    kind: "drawing.pen-stroke",
src/app/HandwrittenFunctionWorkflow.test.tsx:76:    expect(screen.getByText("drawing.pen-stroke")).toBeInTheDocument();
src/app/App.test.tsx:230:      kind: "drawing.pen-stroke",
src/app/App.test.tsx:232:    expect(firstCommand.objects[0]?.points).toHaveLength(7);
src/app/App.test.tsx:246:    expect(secondCommand.objects[0]?.points).toHaveLength(10);
src/app/App.test.tsx:346:    expect(screen.getByText("drawing.pen-stroke")).toBeInTheDocument();
src/app/App.test.tsx:404:    expect(screen.getAllByText("drawing.pen-stroke")).toHaveLength(2);
src/app/PersistedApp.tsx:14:  renderBoardSnapshotPng,
src/app/PersistedApp.tsx:15:  renderBoardSnapshotPdf,
src/app/PersistedApp.tsx:16:  renderBoardSnapshotSvg,
src/app/PersistedApp.tsx:192:        renderBoardSnapshotSvg(document),
src/app/PersistedApp.tsx:208:          await renderBoardSnapshotPng(document),
src/app/PersistedApp.tsx:233:          await renderBoardSnapshotPdf(document),
src/app/handwritten-function-composition.ts:8:  type PenStrokeObject,
src/app/handwritten-function-composition.ts:59:}): readonly PenStrokeObject[] {
src/app/handwritten-function-composition.ts:61:    const points = simplifyStroke(stroke.points.map(({ x, y }) => ({ x, y })));
src/app/handwritten-function-composition.ts:68:      kind: "drawing.pen-stroke",
src/app/handwritten-function-composition.ts:147:  originals: readonly PenStrokeObject[],
src/app/handwritten-function-composition.ts:167:  originals: readonly PenStrokeObject[],
src/app/handwritten-function-composition.ts:174:        current?.kind === "drawing.pen-stroke" &&
src/app/smart-ink-diagnostics-export.ts:81:    return { ...points[sourceIndex]! };
src/app/smart-ink-diagnostics-export.ts:136:          points: boundedPoints(record.points),
src/app/smart-ink-diagnostics-export.ts:176:        points: boundedPoints(record.points),
src/core/ports/board-sync-repository.ts:21:  readonly schemaVersion: "1.1";
src/core/ports/board-sync-repository.ts:106:    readonly schemaVersion: "1.1";
src/core/board/coordinate-plot-integration.test.ts:100:    if (migrated.ok) expect(migrated.document.schemaVersion).toBe("1.1");
src/core/board/selectors.ts:232:    case "drawing.pen-stroke":
src/core/board/selectors.ts:233:      return object.points;
src/core/board/objects.ts:8:  "drawing.pen-stroke",
src/core/board/objects.ts:75:export interface PenStrokeObject extends BoardObjectBase {
src/core/board/objects.ts:76:  readonly kind: "drawing.pen-stroke";
src/core/board/objects.ts:136:  | PenStrokeObject
src/core/board/validation/schema.ts:119:    kind: z.literal("drawing.pen-stroke"),
src/core/board/validation/schema.ts:389:  schemaVersion: "0.1" | "0.2" | "1.0" | "1.1",
src/core/board/validation/schema.ts:415:  "drawing.pen-stroke",
src/core/board/validation/schema.ts:422:  "drawing.pen-stroke",
src/core/public.ts:146:  type PenStrokeObject,
src/adapters/math-ink-http/client.ts:265:    (count, stroke) => count + stroke.points.length,
src/adapters/math-ink-http/rasterization.ts:94:    if (stroke.points.length < 2) continue;
src/adapters/math-ink-http/rasterization.ts:95:    const first = stroke.points[0];
src/adapters/math-ink-http/rasterization.ts:102:    for (const point of stroke.points.slice(1)) {
src/adapters/board-http/client.ts:53:    schemaVersion: z.literal("1.1"),
src/adapters/board-http/client.ts:373:              schemaVersion: z.literal("1.1"),
src/adapters/board-http/client.ts:463:            schemaVersion: "1.1",
src/adapters/geometryos-http/response-normalizer.ts:67:  const source = (item: (typeof value.points)[string]["source"]) => ({
src/adapters/geometryos-http/response-normalizer.ts:89:      Object.entries(value.points).map(([id, item]) => [
src/adapters/geometryos-http/generated/geometryos.validators.mjs:537:if(data1.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:571:if(data1.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:572:let data8 = data1.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:720:if(data1.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:754:if(data1.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:755:let data13 = data1.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:3464:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:3498:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:3499:let data94 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:3627:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:3661:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:3662:let data99 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:4269:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:4303:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:4304:let data118 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:6973:if(data1.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:7007:if(data1.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:7008:let data8 = data1.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:7156:if(data1.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:7190:if(data1.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:7191:let data13 = data1.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:9900:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:9934:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:9935:let data94 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:10063:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:10097:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:10098:let data99 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:10705:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:10739:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:10740:let data118 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:11433:if(data1.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:11467:if(data1.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:11468:let data8 = data1.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:11616:if(data1.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:11650:if(data1.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:11651:let data13 = data1.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:14360:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:14394:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:14395:let data94 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:14523:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:14557:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:14558:let data99 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:15165:if(data89.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:15199:if(data89.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:15200:let data118 = data89.points;
src/adapters/geometryos-http/generated/geometryos.validators.mjs:16294:if(data.points === undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:16559:if(data.points !== undefined){
src/adapters/geometryos-http/generated/geometryos.validators.mjs:16560:let data8 = data.points;
src/adapters/canvas-konva/wet-ink-renderer.ts:329:      actualLine.points([]);
src/adapters/canvas-konva/wet-ink-renderer.ts:331:      predictedLine.points([]);
src/adapters/canvas-konva/wet-ink-renderer.ts:342:      actualLine.points(flattenPoints(frame.actualPoints));
src/adapters/canvas-konva/wet-ink-renderer.ts:353:      predictedLine.points(flattenPoints(predictedPoints));
src/adapters/canvas-konva/coordinate-plot-renderer.tsx:144:      points={[...points]}
src/adapters/canvas-konva/coordinate-plot-renderer.tsx:151:      points={[...points]}
src/adapters/canvas-konva/coordinate-plot-renderer.tsx:887:                      points={[...points]}
src/adapters/canvas-konva/coordinate-plot-renderer.tsx:925:                points={[...points]}
src/adapters/canvas-konva/default-renderers.tsx:127:      points={[...points]}
src/adapters/canvas-konva/default-renderers.tsx:168:    kind: "drawing.pen-stroke",
src/adapters/canvas-konva/default-renderers.tsx:170:      const stroke = expectKind(object, "drawing.pen-stroke");
src/adapters/canvas-konva/default-renderers.tsx:171:      const first = stroke.points[0];
src/adapters/canvas-konva/default-renderers.tsx:172:      const last = stroke.points.at(-1);
src/adapters/canvas-konva/default-renderers.tsx:178:        ? buildCachedSmoothClosedStrokePoints(stroke.points, context.zoom)
src/adapters/canvas-konva/default-renderers.tsx:179:        : buildCachedSmoothStrokePoints(stroke.points, context.zoom);
tests/performance/wet-ink-renderer.test.ts:44:    this.points += frame.actualPoints.length + frame.predictedPoints.length;
tests/performance/wet-ink-renderer.test.ts:71:    expect(surface.points).toBeGreaterThan(20_000);
tests/integration/coordinate-plot-sync.test.ts:143:        schemaVersion: "1.1",
tests/integration/coordinate-plot-sync.test.ts:342:          expectedDocumentSha256.length === 64 && schemaVersion === "1.1",
tests/e2e/smart-ink-corpus-capture.spec.ts:61:  expect(corpus.samples[0]?.points.length).toBeGreaterThan(2);
tests/e2e/compact-tool-dock.spec.ts:53:  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
tests/e2e/document-transfer.spec.ts:22:  expect(exported.schemaVersion).toBe("1.1");
tests/e2e/handwritten-function-production.spec.ts:94:    await expect(page.getByText("drawing.pen-stroke")).toHaveCount(2);
tests/e2e/smart-ink.spec.ts:47:  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
tests/e2e/smart-ink.spec.ts:132:  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
tests/e2e/smart-ink.spec.ts:167:  await expect(page.getByText("drawing.pen-stroke")).toBeVisible();
tests/unit/modules/smart-ink/arrow-recognizer.test.ts:78:      kind: "drawing.pen-stroke",
tests/unit/modules/smart-ink/arrow-recognizer.test.ts:101:      expect(result.proposal.replacement.kind).toBe("drawing.pen-stroke");
tests/unit/modules/smart-ink/proposal.test.ts:5:  type PenStrokeObject,
tests/unit/modules/smart-ink/proposal.test.ts:15:function stroke(points = positiveStrokes.circle): PenStrokeObject {
tests/unit/modules/smart-ink/proposal.test.ts:19:    kind: "drawing.pen-stroke",
tests/unit/modules/smart-ink/proposal.test.ts:62:      expect(result.proposal.original.kind).toBe("drawing.pen-stroke");
tests/unit/modules/smart-ink/proposal.test.ts:145:      "drawing.pen-stroke",
tests/unit/modules/smart-ink/proposal.test.ts:162:      arrow?.kind === "drawing.pen-stroke" ? arrow.points : undefined,
tests/unit/modules/smart-ink/proposal.test.ts:166:      triangle?.kind === "drawing.pen-stroke"
tests/unit/modules/smart-ink/proposal.test.ts:167:        ? triangle.points.at(-1)
tests/unit/modules/smart-ink/diagnostics.test.ts:5:  type PenStrokeObject,
tests/unit/modules/smart-ink/diagnostics.test.ts:13:function lineStroke(): PenStrokeObject {
tests/unit/modules/smart-ink/diagnostics.test.ts:17:    kind: "drawing.pen-stroke",
tests/unit/modules/smart-ink/diagnostics.test.ts:58:    expect(diagnostic?.points).toEqual([
tests/unit/modules/smart-ink/composite-recognizer.test.ts:9:  type PenStrokeObject,
tests/unit/modules/smart-ink/composite-recognizer.test.ts:72:function polygon(vertices: readonly Vec2[]): PenStrokeObject {
tests/unit/modules/smart-ink/composite-recognizer.test.ts:76:    kind: "drawing.pen-stroke",
tests/unit/modules/smart-ink/canvas-policy.test.mjs:14:    kind: "drawing.pen-stroke",
tests/unit/modules/smart-ink/canvas-policy.test.mjs:16:    points: sample.points,
tests/unit/modules/server-sync/sync.test.ts:237:        schemaVersion: "1.1",
tests/unit/modules/server-sync/sync.test.ts:267:            schemaVersion: "1.1",
tests/unit/modules/server-sync/sync.test.ts:350:        schemaVersion: "1.1",
tests/unit/modules/server-sync/sync.test.ts:422:            schemaVersion: "1.1",
tests/unit/modules/server-sync/sync.test.ts:436:        schemaVersion: "1.1",
tests/unit/modules/server-sync/sync.test.ts:483:        schemaVersion: "1.1",
tests/unit/modules/document-transfer/transfer.test.ts:12:  renderBoardSnapshotSvg,
tests/unit/modules/document-transfer/transfer.test.ts:104:    const first = renderBoardSnapshotSvg(document, {
tests/unit/modules/document-transfer/transfer.test.ts:109:      renderBoardSnapshotSvg(document, { height: 600, width: 800 }),
tests/unit/modules/drawing/interaction.test.ts:105:      kind: "drawing.pen-stroke",
tests/unit/modules/drawing/interaction.test.ts:160:      kind: "drawing.pen-stroke",
tests/unit/modules/drawing/interaction.test.ts:163:    if (completed.completedObject?.kind !== "drawing.pen-stroke") return;
tests/unit/modules/drawing/interaction.test.ts:164:    expect(completed.completedObject.points).toHaveLength(7);
tests/unit/modules/drawing/interaction.test.ts:165:    expect(completed.completedObject.points[0]).toEqual(
tests/unit/modules/drawing/interaction.test.ts:166:      completed.completedObject.points.at(-1),
tests/unit/modules/drawing/interaction.test.ts:269:    expect(object?.kind).toBe("drawing.pen-stroke");
tests/unit/modules/smart-ink-spike/corpus.test.ts:101:    invalid.samples[0]!.points[0]!.x = "not-a-coordinate";
tests/unit/modules/smart-ink-spike/hds-import.test.mjs:96:      expect(corpus.samples[0].points).toHaveLength(128);
tests/unit/modules/smart-ink-spike/hds-import.test.mjs:98:        recognizeSmartInkStroke(corpus.samples[0].id, corpus.samples[0].points)
tests/unit/modules/smart-ink-spike/corpus-fixtures.ts:84:  points.push({ ...points[0]! });
tests/unit/modules/smart-ink-spike/captured-chromium-evidence.test.mjs:106:        sample.points.every((point) => Object.keys(point).length === 2),
tests/unit/modules/smart-ink-spike/calibration.test.ts:82:      points: negativeStrokes[index % negativeStrokes.length]!.points,
tests/unit/modules/clipboard/coordinate-plot-clipboard.test.ts:17:  boardClipboardSchemaVersion,
tests/unit/modules/clipboard/coordinate-plot-clipboard.test.ts:127:    expect(copied.payload.schemaVersion).toBe(boardClipboardSchemaVersion);
tests/unit/modules/geometry-import/layout-import.test.ts:134:          Object.entries(success.layoutDocument.points).filter(
tests/unit/app/handwritten-function-composition.test.ts:80:      kind: "drawing.pen-stroke",
tests/unit/app/handwritten-function-composition.test.ts:86:    expect(objects[0]?.points[0]).toEqual({ x: 20, y: 30 });
tests/unit/app/handwritten-function-composition.test.ts:87:    expect(objects[1]?.points.at(-1)).toEqual({ x: 55, y: 70 });
tests/unit/core/board-document.test.ts:29:      expect(result.document.schemaVersion).toBe("1.1");
tests/unit/core/board-document.test.ts:45:      expect(result.document.schemaVersion).toBe("1.1");
tests/unit/core/board-document.test.ts:60:      expect(result.document.schemaVersion).toBe("1.1");
tests/unit/adapters/board-http/client.test.ts:38:  schemaVersion: "1.1",
tests/unit/adapters/canvas-konva/default-renderers.test.tsx:87:      kind: "drawing.pen-stroke",
scripts/check-board-contract.mjs:150:    "PenStrokeObject",
scripts/lib/hds-contour.mjs:176:  const sorted = [...points].sort((left, right) =>
scripts/lib/hds-contour.mjs:226:  const closed = [...points, points[0]];
scripts/board-contract-lib.mjs:101:const penStroke = boardObject("drawing.pen-stroke", {
scripts/board-contract-lib.mjs:261:    reference("PenStrokeObject"),
scripts/board-contract-lib.mjs:356:  PenStrokeObject: penStroke,
scripts/board-contract-lib.mjs:684:  const document = { ...readBoardDocumentFixture(), schemaVersion: "1.1" };
scripts/board-contract-lib.mjs:689:    kind: "drawing.pen-stroke",
scripts/board-contract-lib.mjs:716:  delete smartInkCircle.points;
scripts/board-contract-lib.mjs:741:      schemaVersion: "1.1",
scripts/board-contract-lib.mjs:760:      schemaVersion: "1.1",
scripts/board-contract-lib.mjs:768:      schemaVersion: "1.1",
contracts/board/v1/board-document.schema.json:109:          "$ref": "#/$defs/PenStrokeObject"
contracts/board/v1/board-document.schema.json:1065:    "PenStrokeObject": {
contracts/board/v1/board-document.schema.json:1110:          "const": "drawing.pen-stroke"
contracts/board/v1/board-snapshot.schema.json:109:          "$ref": "#/$defs/PenStrokeObject"
contracts/board/v1/board-snapshot.schema.json:1065:    "PenStrokeObject": {
contracts/board/v1/board-snapshot.schema.json:1110:          "const": "drawing.pen-stroke"
contracts/board/v1/fixtures/board-snapshot.json:4:    "schemaVersion": "1.1",
contracts/board/v1/fixtures/board-snapshot.json:106:  "schemaVersion": "1.1"
contracts/board/v1/fixtures/board-command-envelope.json:20:          "kind": "drawing.pen-stroke",
contracts/board/v1/fixtures/board-command-envelope.json:102:  "schemaVersion": "1.1"
contracts/board/v1/fixtures/board-document.json:2:  "schemaVersion": "1.1",
contracts/board/v1/fixtures/board-geometry-import.json:17:  "schemaVersion": "1.1"
contracts/board/v1/board-command-envelope.schema.json:109:          "$ref": "#/$defs/PenStrokeObject"
contracts/board/v1/board-command-envelope.schema.json:1065:    "PenStrokeObject": {
contracts/board/v1/board-command-envelope.schema.json:1110:          "const": "drawing.pen-stroke"
docs/PHASE_2_TECHNICAL_SPIKE_PLAN.md:638:  | PenStrokeObject
docs/PHASE_2_TECHNICAL_SPIKE_PLAN.md:888:type PenStrokeObject = BoardObjectBase & {
docs/plans/HANDWRITTEN_FUNCTION_PR3.md:98:Completed session strokes become `drawing.pen-stroke` objects with:
docs/architecture/SMART_INK.md:20:2. Pointer completion commits the source `drawing.pen-stroke`.
docs/architecture/BOARD_MODEL.md:37:| `drawing.pen-stroke` | At least two world-space points   |
docs/architecture/STROKE_SMOOTHING.md:3:Freehand `drawing.pen-stroke` objects retain their original BoardDocument points. Rendering uses deterministic resampling and Catmull–Rom interpolation from `src/shared/stroke-smoothing.ts`. Detail increases in quarter-step zoom buckets through the canvas maximum, while bounded point budgets protect responsiveness.
