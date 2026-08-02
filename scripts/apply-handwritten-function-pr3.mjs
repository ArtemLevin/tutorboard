import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

function patchFile(path, transform) {
  const source = fs.readFileSync(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`Patch produced no changes: ${path}`);
  fs.writeFileSync(path, next);
}

patchFile("src/app/App.tsx", (initial) => {
  let source = initial;

  source = replaceOnce(
    source,
    "  type PlotSeriesId,\n  type VisualStyleOverride,",
    "  type PlotSeriesId,\n  type PenStrokeObject,\n  type VisualStyleOverride,",
    "App core pen-stroke type import",
  );

  source = replaceOnce(
    source,
    'import { ColorPalette } from "./ColorPalette";',
    `import {
  calculateHandwrittenFunctionBounds,
  createMathInkRecognitionRequest,
  handwrittenFunctionToolId,
  initialHandwrittenFunctionSessionState,
  interpretMathInkRecognitionResult,
  isMathInkRecognitionAbortError,
  reduceHandwrittenFunctionSession,
  type HandwrittenFunctionInterpretation,
  type HandwrittenFunctionSessionAction,
  type HandwrittenFunctionSessionDiagnosticCode,
  type HandwrittenFunctionSessionState,
  type HandwrittenFunctionStroke,
  type MathInkRecognizer,
} from "../modules/handwritten-function/public";
import { ColorPalette } from "./ColorPalette";
import { HandwrittenFunctionPanel } from "./HandwrittenFunctionPanel";
import {
  createHandwrittenFunctionPlotObject,
  createHandwrittenFunctionReplaceCommand,
  createHandwrittenFunctionStrokeObjects,
  handwrittenFunctionSourceStillApplies,
  interpretHandwrittenFunctionDraft,
} from "./handwritten-function-composition";`,
    "App handwritten imports",
  );

  source = replaceOnce(
    source,
    "type ActiveToolId = typeof navigationToolId | SelectionToolId | DrawingToolId;",
    `type ActiveToolId =
  | typeof navigationToolId
  | typeof handwrittenFunctionToolId
  | SelectionToolId
  | DrawingToolId;`,
    "App active tool type",
  );

  source = replaceOnce(
    source,
    "interface CoordinatePlotEditorSession {\n  readonly draft: CoordinatePlotDefinition;",
    `function handwrittenSessionDiagnosticMessage(
  code: HandwrittenFunctionSessionDiagnosticCode,
): string {
  const messages: Record<HandwrittenFunctionSessionDiagnosticCode, string> = {
    "handwriting.active-stroke": "Завершите текущий штрих.",
    "handwriting.duration-limit": "Ввод занял слишком много времени.",
    "handwriting.empty-session": "Добавьте хотя бы один штрих.",
    "handwriting.empty-stroke": "Короткий штрих пропущен.",
    "handwriting.invalid-action": "Действие недоступно в текущем состоянии.",
    "handwriting.invalid-identifier": "Внутренний идентификатор ввода некорректен.",
    "handwriting.invalid-point": "Координаты штриха некорректны.",
    "handwriting.point-limit": "Достигнут предел точек рукописной функции.",
    "handwriting.pointer-mismatch": "Активный указатель изменился.",
    "handwriting.stale-recognition": "Получен устаревший результат распознавания.",
    "handwriting.stroke-limit": "Достигнут предел количества штрихов.",
  };
  return messages[code];
}

function handwrittenStrokeObjectId(
  sessionId: string,
  stroke: HandwrittenFunctionStroke,
  index: number,
): BoardObjectId {
  return boardObjectId(
    \`object:handwritten-function:\${sessionId}:\${index}:\${stroke.id}\`,
  );
}

interface CoordinatePlotEditorSession {
  readonly draft: CoordinatePlotDefinition;`,
    "App diagnostic helpers",
  );

  source = replaceOnce(
    source,
    "  readonly geometryOsClient?: GeometryOsClient | undefined;\n  readonly historyEnabled?: boolean;",
    "  readonly geometryOsClient?: GeometryOsClient | undefined;\n  readonly historyEnabled?: boolean;\n  readonly mathInkRecognizer?: MathInkRecognizer | undefined;",
    "App recognizer prop",
  );

  source = replaceOnce(
    source,
    "  geometryOsClient,\n  historyEnabled = true,",
    "  geometryOsClient,\n  historyEnabled = true,\n  mathInkRecognizer,",
    "App recognizer destructuring",
  );

  source = replaceOnce(
    source,
    "  const [smartInkNotice, setSmartInkNotice] = useState<string | null>(null);\n  const [selectionState, setSelectionState] = useState(initialSelectionState);",
    `  const [smartInkNotice, setSmartInkNotice] = useState<string | null>(null);
  const [handwrittenFunctionState, setHandwrittenFunctionState] =
    useState<HandwrittenFunctionSessionState>(
      initialHandwrittenFunctionSessionState,
    );
  const handwrittenFunctionStateRef = useRef<HandwrittenFunctionSessionState>(
    initialHandwrittenFunctionSessionState,
  );
  const [handwrittenFunctionSourceObjects, setHandwrittenFunctionSourceObjects] =
    useState<readonly PenStrokeObject[] | null>(null);
  const handwrittenFunctionSourceObjectsRef = useRef<
    readonly PenStrokeObject[] | null
  >(null);
  const [handwrittenFunctionInterpretation, setHandwrittenFunctionInterpretation] =
    useState<HandwrittenFunctionInterpretation | null>(null);
  const [handwrittenFunctionDraft, setHandwrittenFunctionDraft] = useState("");
  const [handwrittenFunctionDiagnostic, setHandwrittenFunctionDiagnostic] =
    useState<string | null>(null);
  const handwrittenFunctionRecognitionAbortRef =
    useRef<AbortController | null>(null);
  const [selectionState, setSelectionState] = useState(initialSelectionState);`,
    "App handwritten state",
  );

  source = replaceOnce(
    source,
    "      geometryOperationRef.current?.cancel();\n    },",
    "      geometryOperationRef.current?.cancel();\n      handwrittenFunctionRecognitionAbortRef.current?.abort();\n    },",
    "App unmount abort",
  );

  source = replaceOnce(
    source,
    `  const drawingPreview = useMemo(
    () => getDrawingPreview(drawingState),
    [drawingState],
  );
  const previewItems = useMemo<readonly BoardRenderItem[]>(
    () =>
      drawingPreview === null
        ? []
        : [{ object: drawingPreview, transforms: [] }],
    [drawingPreview],
  );`,
    `  const drawingPreview = useMemo(
    () => getDrawingPreview(drawingState),
    [drawingState],
  );
  const handwrittenFunctionStrokes = useMemo<
    readonly HandwrittenFunctionStroke[]
  >(() => {
    if (handwrittenFunctionState.kind === "idle") return [];
    const active =
      handwrittenFunctionState.kind === "collecting"
        ? handwrittenFunctionState.activeStroke
        : null;
    return active !== null && active.points.length >= 2
      ? [
          ...handwrittenFunctionState.strokes,
          { id: active.id, points: active.points },
        ]
      : handwrittenFunctionState.strokes;
  }, [handwrittenFunctionState]);
  const handwrittenFunctionBounds = useMemo(
    () =>
      handwrittenFunctionState.kind === "idle"
        ? null
        : handwrittenFunctionState.kind === "collecting"
          ? calculateHandwrittenFunctionBounds(handwrittenFunctionStrokes)
          : handwrittenFunctionState.bounds,
    [handwrittenFunctionState, handwrittenFunctionStrokes],
  );
  const handwrittenFunctionDraftInterpretation = useMemo(
    () =>
      handwrittenFunctionDraft.trim().length === 0
        ? null
        : interpretHandwrittenFunctionDraft(handwrittenFunctionDraft),
    [handwrittenFunctionDraft],
  );
  const handwrittenFunctionDraftCandidate =
    handwrittenFunctionDraftInterpretation?.status === "accepted"
      ? handwrittenFunctionDraftInterpretation.selected
      : null;
  const handwrittenFunctionDraftIssue = useMemo(() => {
    if (handwrittenFunctionDraft.trim().length === 0) {
      return handwrittenFunctionSourceObjects === null
        ? null
        : "Введите функцию для построения графика.";
    }
    if (handwrittenFunctionDraftCandidate !== null) return null;
    return (
      handwrittenFunctionDraftInterpretation?.diagnostics.find(
        ({ severity, code }) =>
          severity === "error" &&
          code !== "handwriting.interpretation.no-valid-candidate",
      )?.message ?? "Выражение пока нельзя построить."
    );
  }, [
    handwrittenFunctionDraft,
    handwrittenFunctionDraftCandidate,
    handwrittenFunctionDraftInterpretation,
    handwrittenFunctionSourceObjects,
  ]);
  const handwrittenFunctionPlotObject = useMemo(() => {
    if (
      handwrittenFunctionBounds === null ||
      handwrittenFunctionDraftCandidate === null ||
      handwrittenFunctionState.kind === "idle"
    ) {
      return null;
    }
    const sessionId = handwrittenFunctionState.sessionId;
    return createHandwrittenFunctionPlotObject({
      bounds: handwrittenFunctionBounds,
      candidate: handwrittenFunctionDraftCandidate,
      ids: {
        objectId: boardObjectId(
          \`object:handwritten-function-plot:\${sessionId}\`,
        ),
        parameterId: (_name, index) =>
          plotParameterId(
            \`plot-parameter:handwritten-function:\${sessionId}:\${index}\`,
          ),
        seriesId: plotSeriesId(
          \`plot-series:handwritten-function:\${sessionId}\`,
        ),
      },
    });
  }, [
    handwrittenFunctionBounds,
    handwrittenFunctionDraftCandidate,
    handwrittenFunctionState,
  ]);
  const handwrittenFunctionSourceApplies = useMemo(
    () =>
      handwrittenFunctionSourceObjects !== null &&
      handwrittenFunctionSourceStillApplies(
        document,
        handwrittenFunctionSourceObjects,
      ),
    [document, handwrittenFunctionSourceObjects],
  );
  const handwrittenFunctionPreviewItems = useMemo<readonly BoardRenderItem[]>(
    () => {
      const inkItems =
        handwrittenFunctionSourceObjects !== null ||
        handwrittenFunctionState.kind === "idle"
          ? []
          : createHandwrittenFunctionStrokeObjects({
              ids: {
                objectId: (stroke, index) =>
                  handwrittenStrokeObjectId(
                    handwrittenFunctionState.sessionId,
                    stroke,
                    index,
                  ),
              },
              strokes: handwrittenFunctionStrokes,
            }).map((object) => ({ object, transforms: [] }));
      const plotItems =
        handwrittenFunctionSourceObjects === null ||
        handwrittenFunctionPlotObject === null
          ? []
          : [
              {
                object: {
                  ...handwrittenFunctionPlotObject,
                  style: {
                    ...handwrittenFunctionPlotObject.style,
                    opacity: 0.72,
                  },
                },
                transforms: [],
              },
            ];
      return [...inkItems, ...plotItems];
    },
    [
      handwrittenFunctionPlotObject,
      handwrittenFunctionSourceObjects,
      handwrittenFunctionState,
      handwrittenFunctionStrokes,
    ],
  );
  const previewItems = useMemo<readonly BoardRenderItem[]>(
    () => [
      ...(drawingPreview === null
        ? []
        : [{ object: drawingPreview, transforms: [] }]),
      ...handwrittenFunctionPreviewItems,
    ],
    [drawingPreview, handwrittenFunctionPreviewItems],
  );`,
    "App preview composition",
  );

  source = replaceOnce(
    source,
    `  const activateTool = useCallback(
    (tool: ActiveToolId) => {`,
    `  const applyHandwrittenFunctionAction = useCallback(
    (action: HandwrittenFunctionSessionAction): HandwrittenFunctionSessionState => {
      const result = reduceHandwrittenFunctionSession(
        handwrittenFunctionStateRef.current,
        action,
      );
      handwrittenFunctionStateRef.current = result.state;
      setHandwrittenFunctionState(result.state);
      if (result.diagnostic !== null) {
        setHandwrittenFunctionDiagnostic(
          handwrittenSessionDiagnosticMessage(result.diagnostic),
        );
      }
      return result.state;
    },
    [],
  );

  const closeHandwrittenFunctionState = useCallback(() => {
    handwrittenFunctionRecognitionAbortRef.current?.abort();
    handwrittenFunctionRecognitionAbortRef.current = null;
    handwrittenFunctionStateRef.current =
      initialHandwrittenFunctionSessionState;
    setHandwrittenFunctionState(initialHandwrittenFunctionSessionState);
    handwrittenFunctionSourceObjectsRef.current = null;
    setHandwrittenFunctionSourceObjects(null);
    setHandwrittenFunctionInterpretation(null);
    setHandwrittenFunctionDraft("");
    setHandwrittenFunctionDiagnostic(null);
  }, []);

  const materializeHandwrittenFunctionInk = useCallback(
    (
      state: Exclude<HandwrittenFunctionSessionState, { readonly kind: "idle" }>,
    ): readonly PenStrokeObject[] | null => {
      const existing = handwrittenFunctionSourceObjectsRef.current;
      if (existing !== null) return existing;
      if (state.strokes.length === 0) return null;
      const objects = createHandwrittenFunctionStrokeObjects({
        ids: {
          objectId: (stroke, index) =>
            handwrittenStrokeObjectId(state.sessionId, stroke, index),
        },
        strokes: state.strokes,
      });
      const committed = commitCommand({
        ...createCommandMetadata(),
        kind: "core.objects.add",
        objects,
      });
      if (!committed.ok) {
        setHandwrittenFunctionDiagnostic(committed.error.message);
        return null;
      }
      handwrittenFunctionSourceObjectsRef.current = objects;
      setHandwrittenFunctionSourceObjects(objects);
      return objects;
    },
    [commitCommand, createCommandMetadata],
  );

  const preserveHandwrittenFunctionInk = useCallback((): boolean => {
    handwrittenFunctionRecognitionAbortRef.current?.abort();
    let state = handwrittenFunctionStateRef.current;
    if (
      state.kind === "collecting" &&
      state.activeStroke !== null &&
      state.activeStroke.points.length >= 2
    ) {
      const point = state.activeStroke.points.at(-1)!;
      state = applyHandwrittenFunctionAction({
        kind: "finish-stroke",
        point,
        pointerId: state.activeStroke.pointerId,
      });
    }
    if (
      state.kind !== "idle" &&
      state.strokes.length > 0 &&
      handwrittenFunctionSourceObjectsRef.current === null &&
      materializeHandwrittenFunctionInk(state) === null
    ) {
      return false;
    }
    closeHandwrittenFunctionState();
    setAccessibilityNotice("Рукописные штрихи оставлены на доске");
    return true;
  }, [
    applyHandwrittenFunctionAction,
    closeHandwrittenFunctionState,
    materializeHandwrittenFunctionInk,
  ]);

  const clearHandwrittenFunction = useCallback(() => {
    handwrittenFunctionRecognitionAbortRef.current?.abort();
    const originals = handwrittenFunctionSourceObjectsRef.current;
    if (originals !== null) {
      const objectIds = originals
        .map(({ id }) => id)
        .filter((id) => documentRef.current.objects[id] !== undefined);
      if (objectIds.length > 0) {
        const removed = commitCommand({
          ...createCommandMetadata(),
          kind: "core.objects.delete",
          objectIds,
        });
        if (!removed.ok) {
          setHandwrittenFunctionDiagnostic(removed.error.message);
          return;
        }
      }
    }
    closeHandwrittenFunctionState();
    setAccessibilityNotice("Рукописный ввод очищен");
  }, [
    closeHandwrittenFunctionState,
    commitCommand,
    createCommandMetadata,
  ]);

  const recognizeHandwrittenFunction = useCallback(() => {
    let state = handwrittenFunctionStateRef.current;
    if (state.kind === "idle" || state.kind === "recognizing") return;
    if (state.kind === "resolved" || state.kind === "failed") {
      state = applyHandwrittenFunctionAction({ kind: "reopen-input" });
    }
    if (state.kind === "collecting") {
      state = applyHandwrittenFunctionAction({ kind: "complete-input" });
    }
    if (state.kind !== "ready") return;
    const sourceObjects = materializeHandwrittenFunctionInk(state);
    if (sourceObjects === null) return;
    if (mathInkRecognizer === undefined) {
      setHandwrittenFunctionDiagnostic(
        "Штрихи сохранены. Введите функцию вручную.",
      );
      setAccessibilityNotice("Штрихи сохранены для ручного ввода функции");
      return;
    }

    handwrittenFunctionRecognitionAbortRef.current?.abort();
    const recognitionId = \`recognition:\${crypto.randomUUID()}\`;
    const request = createMathInkRecognitionRequest(state, recognitionId);
    const started = applyHandwrittenFunctionAction({
      kind: "recognition-started",
      recognitionId,
    });
    if (started.kind !== "recognizing") return;
    const controller = new AbortController();
    handwrittenFunctionRecognitionAbortRef.current = controller;
    setHandwrittenFunctionDiagnostic(null);
    void mathInkRecognizer
      .recognize(request, controller.signal)
      .then((result) => {
        const current = handwrittenFunctionStateRef.current;
        if (
          controller.signal.aborted ||
          current.kind !== "recognizing" ||
          current.recognitionId !== recognitionId
        ) {
          return;
        }
        const resolved = applyHandwrittenFunctionAction({
          kind: "recognition-resolved",
          recognitionId,
          result,
        });
        if (resolved.kind !== "resolved") return;
        const interpreted = interpretMathInkRecognitionResult(result);
        setHandwrittenFunctionInterpretation(interpreted);
        const expression =
          interpreted.selected?.expression ??
          interpreted.candidates[0]?.expression ??
          "";
        setHandwrittenFunctionDraft(expression);
        setHandwrittenFunctionDiagnostic(
          interpreted.status === "accepted"
            ? null
            : interpreted.status === "ambiguous"
              ? "Проверьте выбранный вариант или исправьте выражение."
              : "Введите функцию вручную или повторите распознавание.",
        );
        setAccessibilityNotice(
          interpreted.status === "accepted"
            ? "Рукописная функция распознана"
            : "Результат распознавания требует проверки",
        );
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          isMathInkRecognitionAbortError(error)
        ) {
          return;
        }
        const current = handwrittenFunctionStateRef.current;
        if (
          current.kind !== "recognizing" ||
          current.recognitionId !== recognitionId
        ) {
          return;
        }
        applyHandwrittenFunctionAction({
          error: {
            code: "handwriting.recognition-failed",
            message:
              error instanceof Error
                ? error.message
                : "Распознавание завершилось ошибкой.",
            retryable: true,
          },
          kind: "recognition-failed",
          recognitionId,
        });
        setHandwrittenFunctionDiagnostic(
          error instanceof Error
            ? error.message
            : "Распознавание завершилось ошибкой.",
        );
        setAccessibilityNotice(
          "Распознавание завершилось ошибкой; штрихи сохранены",
        );
      })
      .finally(() => {
        if (handwrittenFunctionRecognitionAbortRef.current === controller) {
          handwrittenFunctionRecognitionAbortRef.current = null;
        }
      });
  }, [
    applyHandwrittenFunctionAction,
    materializeHandwrittenFunctionInk,
    mathInkRecognizer,
  ]);

  const buildHandwrittenFunctionPlot = useCallback(() => {
    const originals = handwrittenFunctionSourceObjectsRef.current;
    if (
      originals === null ||
      handwrittenFunctionPlotObject === null ||
      !handwrittenFunctionSourceStillApplies(
        documentRef.current,
        originals,
      )
    ) {
      setHandwrittenFunctionDiagnostic(
        "Исходные штрихи изменились. Запустите ввод заново.",
      );
      return;
    }
    const result = commitCommand(
      createHandwrittenFunctionReplaceCommand(
        createCommandMetadata(),
        originals,
        handwrittenFunctionPlotObject,
      ),
    );
    if (!result.ok) {
      setHandwrittenFunctionDiagnostic(result.error.message);
      return;
    }
    closeHandwrittenFunctionState();
    const selected: SelectionState = {
      interaction: { kind: "idle" },
      selectedObjectIds: [handwrittenFunctionPlotObject.id],
    };
    selectionStateRef.current = selected;
    setSelectionState(selected);
    setSelectionInspectorObjectId(null);
    setActiveTool(selectionToolId);
    setAccessibilityNotice("График рукописной функции построен");
  }, [
    closeHandwrittenFunctionState,
    commitCommand,
    createCommandMetadata,
    handwrittenFunctionPlotObject,
  ]);

  const activateTool = useCallback(
    (tool: ActiveToolId) => {`,
    "App handwritten callbacks",
  );

  source = replaceOnce(
    source,
    `    (tool: ActiveToolId) => {
      applyDrawingAction({ kind: "cancel" });`,
    `    (tool: ActiveToolId) => {
      if (
        activeTool === handwrittenFunctionToolId &&
        tool !== handwrittenFunctionToolId &&
        !preserveHandwrittenFunctionInk()
      ) {
        return;
      }
      applyDrawingAction({ kind: "cancel" });`,
    "App tool switch preservation",
  );

  source = replaceOnce(
    source,
    "    [applyDrawingAction],\n  );\n\n  const beginCoordinatePlotEditing",
    "    [activeTool, applyDrawingAction, preserveHandwrittenFunctionInk],\n  );\n\n  const beginCoordinatePlotEditing",
    "App activateTool dependencies",
  );

  source = replaceOnce(
    source,
    `      if (event.key === "Escape" && coordinatePlotEditor !== null) {
        return;
      }`,
    `      if (
        event.key === "Escape" &&
        (activeTool === handwrittenFunctionToolId ||
          handwrittenFunctionState.kind !== "idle")
      ) {
        event.preventDefault();
        activateTool(navigationToolId);
        return;
      }
      if (event.key === "Escape" && coordinatePlotEditor !== null) {
        return;
      }`,
    "App Escape preservation",
  );

  source = replaceOnce(
    source,
    `      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        createCoordinatePlot();
        return;
      }`,
    `      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        createCoordinatePlot();
        return;
      }
      if (
        event.key.toLowerCase() === "f" &&
        environment.features.handwrittenFunctions &&
        !readOnly
      ) {
        event.preventDefault();
        activateTool(handwrittenFunctionToolId);
        return;
      }`,
    "App F shortcut",
  );

  source = replaceOnce(
    source,
    "    closeShortcuts,\n    coordinatePlotEditor,",
    "    activeTool,\n    closeShortcuts,\n    coordinatePlotEditor,",
    "App shortcut active dependency",
  );

  source = replaceOnce(
    source,
    "    createCoordinatePlot,\n    commitCommand,",
    "    createCoordinatePlot,\n    commitCommand,\n    handwrittenFunctionState.kind,\n    readOnly,",
    "App shortcut handwritten dependencies",
  );

  source = replaceOnce(
    source,
    `  const startDrawing = useCallback(
    (sample: WorldPointerSample) => {
      if (!isDrawingToolId(activeTool)) {
        return;
      }`,
    `  const startHandwrittenFunctionStroke = useCallback(
    (sample: WorldPointerSample) => {
      let state = handwrittenFunctionStateRef.current;
      const point = {
        timeMs: performance.now(),
        x: sample.point.x,
        y: sample.point.y,
      };
      if (state.kind === "idle") {
        state = applyHandwrittenFunctionAction({
          kind: "begin",
          sessionId: \`handwriting-session:\${crypto.randomUUID()}\`,
          startedAtMs: point.timeMs,
        });
      }
      if (state.kind !== "collecting") return;
      setHandwrittenFunctionDiagnostic(null);
      applyHandwrittenFunctionAction({
        kind: "start-stroke",
        point,
        pointerId: sample.pointerId,
        strokeId: \`handwriting-stroke:\${crypto.randomUUID()}\`,
      });
    },
    [applyHandwrittenFunctionAction],
  );

  const moveHandwrittenFunctionStroke = useCallback(
    (sample: WorldPointerSample) => {
      applyHandwrittenFunctionAction({
        kind: "append-point",
        point: {
          timeMs: performance.now(),
          x: sample.point.x,
          y: sample.point.y,
        },
        pointerId: sample.pointerId,
      });
    },
    [applyHandwrittenFunctionAction],
  );

  const finishHandwrittenFunctionStroke = useCallback(
    (sample: WorldPointerSample) => {
      applyHandwrittenFunctionAction({
        kind: "finish-stroke",
        point: {
          timeMs: performance.now(),
          x: sample.point.x,
          y: sample.point.y,
        },
        pointerId: sample.pointerId,
      });
    },
    [applyHandwrittenFunctionAction],
  );

  const cancelHandwrittenFunctionStroke = useCallback(
    (pointerId: number) => {
      applyHandwrittenFunctionAction({ kind: "cancel-stroke", pointerId });
    },
    [applyHandwrittenFunctionAction],
  );

  const startDrawing = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === handwrittenFunctionToolId) {
        startHandwrittenFunctionStroke(sample);
        return;
      }
      if (!isDrawingToolId(activeTool)) {
        return;
      }`,
    "App handwritten pointer start",
  );

  source = replaceOnce(
    source,
    "    [activeTool, applyDrawingAction, textDraft],\n  );\n\n  const moveDrawing",
    "    [\n      activeTool,\n      applyDrawingAction,\n      startHandwrittenFunctionStroke,\n      textDraft,\n    ],\n  );\n\n  const moveDrawing",
    "App startDrawing dependencies",
  );

  source = replaceOnce(
    source,
    `  const moveDrawing = useCallback(
    (sample: WorldPointerSample) => {
      applyDrawingAction({`,
    `  const moveDrawing = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === handwrittenFunctionToolId) {
        moveHandwrittenFunctionStroke(sample);
        return;
      }
      applyDrawingAction({`,
    "App handwritten pointer move",
  );

  source = replaceOnce(
    source,
    "    [applyDrawingAction],\n  );\n\n  const finishDrawing",
    "    [activeTool, applyDrawingAction, moveHandwrittenFunctionStroke],\n  );\n\n  const finishDrawing",
    "App moveDrawing dependencies",
  );

  source = replaceOnce(
    source,
    `  const finishDrawing = useCallback(
    (sample: WorldPointerSample) => {
      applyDrawingAction(`,
    `  const finishDrawing = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === handwrittenFunctionToolId) {
        finishHandwrittenFunctionStroke(sample);
        return;
      }
      applyDrawingAction(`,
    "App handwritten pointer finish",
  );

  source = replaceOnce(
    source,
    "    [activeTool, applyDrawingAction],\n  );\n\n  const cancelDrawing",
    "    [\n      activeTool,\n      applyDrawingAction,\n      finishHandwrittenFunctionStroke,\n    ],\n  );\n\n  const cancelDrawing",
    "App finishDrawing dependencies",
  );

  source = replaceOnce(
    source,
    `  const cancelDrawing = useCallback(
    (pointerId: number) => {
      applyDrawingAction({ kind: "cancel", pointerId });
    },
    [applyDrawingAction],
  );`,
    `  const cancelDrawing = useCallback(
    (pointerId: number) => {
      if (activeTool === handwrittenFunctionToolId) {
        cancelHandwrittenFunctionStroke(pointerId);
        return;
      }
      applyDrawingAction({ kind: "cancel", pointerId });
    },
    [activeTool, applyDrawingAction, cancelHandwrittenFunctionStroke],
  );`,
    "App handwritten pointer cancel",
  );

  source = replaceOnce(
    source,
    `  const selectionInspectorOpen =
    coordinatePlotEditor === null &&`,
    `  const handwrittenFunctionCanRecognize =
    handwrittenFunctionState.kind !== "idle" &&
    handwrittenFunctionState.kind !== "recognizing" &&
    handwrittenFunctionState.strokes.length > 0 &&
    (handwrittenFunctionState.kind !== "collecting" ||
      handwrittenFunctionState.activeStroke === null) &&
    (mathInkRecognizer !== undefined ||
      handwrittenFunctionSourceObjects === null);
  const handwrittenFunctionCanBuild =
    handwrittenFunctionState.kind !== "recognizing" &&
    handwrittenFunctionDraftCandidate !== null &&
    handwrittenFunctionPlotObject !== null &&
    handwrittenFunctionSourceApplies;
  const handwrittenFunctionPanelOpen =
    environment.features.handwrittenFunctions &&
    (activeTool === handwrittenFunctionToolId ||
      handwrittenFunctionState.kind !== "idle");
  const selectionInspectorOpen =
    coordinatePlotEditor === null &&`,
    "App handwritten derived controls",
  );

  source = replaceOnce(
    source,
    `          <span aria-hidden="true" className="toolbar-divider" />
          {drawingTools.map((tool) => (`,
    `          <span aria-hidden="true" className="toolbar-divider" />
          {environment.features.handwrittenFunctions ? (
            <button
              aria-label="Рукописная функция (F)"
              aria-pressed={activeTool === handwrittenFunctionToolId}
              className={
                activeTool === handwrittenFunctionToolId
                  ? "drawing-tool is-active"
                  : "drawing-tool"
              }
              disabled={readOnly}
              onClick={() => activateTool(handwrittenFunctionToolId)}
              title="Рукописная функция · F"
              type="button"
            >
              <span aria-hidden="true">ƒ</span>
            </button>
          ) : null}
          {drawingTools.map((tool) => (`,
    "App handwritten toolbar button",
  );

  source = replaceOnce(
    source,
    `          drawingModeKey={isDrawingToolId(activeTool) ? activeTool : null}`,
    `          drawingModeKey={
            isDrawingToolId(activeTool) ||
            activeTool === handwrittenFunctionToolId
              ? activeTool
              : null
          }`,
    "App BoardStage drawing mode",
  );

  source = replaceOnce(
    source,
    `        {coordinatePlotEditor === null ? null : (
          <CoordinatePlotEditorPanel`,
    `        {handwrittenFunctionPanelOpen ? (
          <HandwrittenFunctionPanel
            canBuild={handwrittenFunctionCanBuild}
            canRecognize={handwrittenFunctionCanRecognize}
            diagnostic={handwrittenFunctionDiagnostic}
            draftCandidate={handwrittenFunctionDraftCandidate}
            draftExpression={handwrittenFunctionDraft}
            draftIssue={handwrittenFunctionDraftIssue}
            interpretation={handwrittenFunctionInterpretation}
            onBuild={buildHandwrittenFunctionPlot}
            onCandidateSelect={setHandwrittenFunctionDraft}
            onClear={clearHandwrittenFunction}
            onDraftChange={setHandwrittenFunctionDraft}
            onKeepInk={() => activateTool(navigationToolId)}
            onRecognize={recognizeHandwrittenFunction}
            recognizerAvailable={mathInkRecognizer !== undefined}
            session={handwrittenFunctionState}
            sourcePersisted={handwrittenFunctionSourceObjects !== null}
          />
        ) : null}
        {coordinatePlotEditor === null ? null : (
          <CoordinatePlotEditorPanel`,
    "App handwritten panel render",
  );

  source = replaceOnce(
    source,
    `              : activeTool === navigationToolId
                ? "Навигация"`,
    `              : activeTool === handwrittenFunctionToolId
                ? "Рукописная функция"
                : activeTool === navigationToolId
                  ? "Навигация"`,
    "App handwritten help heading",
  );

  source = replaceOnce(
    source,
    `              : activeTool === navigationToolId
                ? "Потяните полотно для перемещения"`,
    `              : activeTool === handwrittenFunctionToolId
                ? "Нарисуйте формулу несколькими штрихами и нажмите «Распознать»"
                : activeTool === navigationToolId
                  ? "Потяните полотно для перемещения"`,
    "App handwritten help body",
  );

  source = replaceOnce(
    source,
    "                <dt>V / L / H / P / I / R / E / T / G</dt>",
    "                <dt>V / L / H / P / I / R / E / T / F / G</dt>",
    "App shortcuts F listing",
  );

  return source;
});

patchFile("src/app/styles.css", (source) => `${source}\n
.handwritten-function-panel {
  position: absolute;
  top: 1rem;
  left: 50%;
  z-index: 18;
  width: min(34rem, calc(100% - 2rem));
  transform: translateX(-50%);
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  border-radius: 1rem;
  background: color-mix(in srgb, var(--panel) 96%, transparent);
  box-shadow: 0 1.2rem 3rem rgb(15 23 42 / 18%);
  backdrop-filter: blur(12px);
}

.handwritten-function-heading,
.handwritten-function-summary,
.handwritten-function-actions,
.handwritten-function-parameters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.handwritten-function-heading > div {
  display: grid;
  gap: 0.15rem;
}

.handwritten-function-heading span,
.handwritten-function-summary,
.handwritten-function-guidance,
.handwritten-function-expression + small,
.handwritten-function-candidates button span,
.handwritten-function-diagnostic {
  color: var(--muted-text);
  font-size: 0.82rem;
}

.handwritten-function-heading > button {
  align-self: start;
  min-width: 2rem;
  min-height: 2rem;
  border-radius: 999px;
}

.handwritten-function-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.handwritten-function-actions button,
.handwritten-function-build,
.handwritten-function-candidates button {
  border: 1px solid var(--border);
  border-radius: 0.7rem;
  background: var(--panel-strong);
}

.handwritten-function-actions button:first-child,
.handwritten-function-build {
  background: var(--accent);
  color: white;
  border-color: transparent;
}

.handwritten-function-candidates {
  display: grid;
  gap: 0.45rem;
}

.handwritten-function-candidates > div {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.45rem;
}

.handwritten-function-candidates button {
  display: grid;
  gap: 0.2rem;
  justify-items: start;
  padding: 0.6rem 0.7rem;
  text-align: left;
}

.handwritten-function-candidates button[aria-pressed="true"] {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.handwritten-function-expression {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.6rem;
  font-weight: 700;
}

.handwritten-function-expression input {
  width: 100%;
  min-width: 0;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.65rem;
  background: var(--canvas);
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.handwritten-function-parameters {
  justify-content: flex-start;
}

.handwritten-function-error,
.handwritten-function-diagnostic {
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 0.6rem;
}

.handwritten-function-error {
  background: rgb(220 38 38 / 10%);
  color: var(--danger, #b91c1c);
}

.handwritten-function-diagnostic {
  background: rgb(37 99 235 / 9%);
}

.handwritten-function-build {
  justify-self: end;
  padding: 0.65rem 1rem;
  font-weight: 800;
}

@media (max-width: 720px) {
  .handwritten-function-panel {
    top: 0.5rem;
    width: calc(100% - 1rem);
    max-height: calc(100% - 1rem);
    overflow: auto;
  }

  .handwritten-function-expression {
    grid-template-columns: 1fr;
  }

  .handwritten-function-build {
    justify-self: stretch;
  }
}
`);

patchFile("src/app/App.test.tsx", (initial) => {
  let source = initial;
  source = replaceOnce(
    source,
    'import { actorId, geometryOsRequestId } from "../core/public";',
    `import { actorId, geometryOsRequestId } from "../core/public";
import {
  createFakeMathInkRecognizer,
  mathInkRecognitionResultSchemaVersion,
} from "../modules/handwritten-function/public";`,
    "App test recognizer import",
  );

  source = replaceOnce(
    source,
    `  it("copies, pastes and cuts a deterministic selection closure", () => {`,
    `  it("captures, recognizes, builds and atomically undoes a handwritten function", async () => {
    const onCommandCommitted = vi.fn();
    const recognizer = createFakeMathInkRecognizer({
      result: {
        candidates: [
          {
            confidence: 0.98,
            expression: "x^2-1",
            format: "plot-expression",
          },
        ],
        diagnostics: [],
        recognizerId: "test.handwriting",
        recognizerVersion: "1",
        schemaVersion: mathInkRecognitionResultSchemaVersion,
        status: "recognized",
      },
    });
    render(
      <App
        mathInkRecognizer={recognizer}
        onCommandCommitted={onCommandCommitted}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Рукописная функция (F)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить жест" }));
    expect(screen.getByText("Штрихов: 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Распознать" }));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Функция y =" }),
      ).toHaveValue("x^2-1"),
    );
    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");
    expect(recognizer.getRequests()).toHaveLength(1);

    fireEvent.change(screen.getByRole("textbox", { name: "Функция y =" }), {
      target: { value: "a*x^2+b" },
    });
    expect(screen.getByText("a, b")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Построить график" }),
    );

    expect(screen.getByTestId("object-count")).toHaveTextContent("1 объекта");
    expect(screen.getByText("math.coordinate-plot")).toBeInTheDocument();
    expect(onCommandCommitted.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "core.objects.replace",
    });
    expect(screen.getByTestId("history-depth")).toHaveTextContent("2/0");

    fireEvent.keyDown(window, { ctrlKey: true, key: "z" });
    expect(screen.getByTestId("object-count")).toHaveTextContent("2 объекта");
    expect(screen.getAllByText("drawing.pen-stroke")).toHaveLength(2);
    expect(screen.getByTestId("history-depth")).toHaveTextContent("1/1");
  });

  it("copies, pastes and cuts a deterministic selection closure", () => {`,
    "App handwritten workflow test",
  );
  return source;
});

patchFile("package.json", (source) =>
  replaceOnce(
    source,
    '    "handwriting:pr2": "vitest run tests/unit/modules/handwritten-function/expression-conversion.test.ts tests/unit/modules/handwritten-function/interpretation.test.ts --reporter=verbose",',
    '    "handwriting:pr2": "vitest run tests/unit/modules/handwritten-function/expression-conversion.test.ts tests/unit/modules/handwritten-function/interpretation.test.ts --reporter=verbose",\n    "handwriting:pr3": "vitest run tests/unit/app/handwritten-function-composition.test.ts src/app/HandwrittenFunctionPanel.test.tsx src/app/App.test.tsx --reporter=verbose",',
    "package handwriting PR 3 script",
  ),
);
