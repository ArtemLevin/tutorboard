import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  boardObjectId,
  plotParameterId,
  plotSeriesId,
  type BoardObjectId,
  type BoardRenderItem,
  type PenStrokeObject,
  type Vec2,
} from "../../../core/public";
import {
  calculateHandwrittenFunctionBounds,
  createMathInkRecognitionRequest,
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
} from "../../../modules/handwritten-function/public";
import {
  createHandwrittenFunctionPlotObject,
  createHandwrittenFunctionReplaceCommand,
  createHandwrittenFunctionStrokeObjects,
  handwrittenFunctionSourceStillApplies,
  interpretHandwrittenFunctionDraft,
} from "../../handwritten-function-composition";
import type { BoardDocumentController } from "./useBoardDocumentController";

interface HandwritingPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
}

export interface UseBoardHandwritingControllerOptions {
  readonly announce: (message: string) => void;
  readonly documentController: BoardDocumentController;
  readonly onPlotBuilt: (objectId: BoardObjectId) => void;
  readonly recognizer?: MathInkRecognizer | undefined;
}

function diagnosticMessage(
  code: HandwrittenFunctionSessionDiagnosticCode,
): string {
  const messages: Record<HandwrittenFunctionSessionDiagnosticCode, string> = {
    "handwriting.active-stroke": "Завершите текущий штрих.",
    "handwriting.duration-limit": "Ввод занял слишком много времени.",
    "handwriting.empty-session": "Добавьте хотя бы один штрих.",
    "handwriting.empty-stroke": "Короткий штрих пропущен.",
    "handwriting.invalid-action": "Действие недоступно в текущем состоянии.",
    "handwriting.invalid-identifier":
      "Внутренний идентификатор ввода некорректен.",
    "handwriting.invalid-point": "Координаты штриха некорректны.",
    "handwriting.point-limit": "Достигнут предел точек рукописной функции.",
    "handwriting.pointer-mismatch": "Активный указатель изменился.",
    "handwriting.stale-recognition":
      "Получен устаревший результат распознавания.",
    "handwriting.stroke-limit": "Достигнут предел количества штрихов.",
  };
  return messages[code];
}

function strokeObjectId(
  sessionId: string,
  stroke: HandwrittenFunctionStroke,
  index: number,
): BoardObjectId {
  return boardObjectId(
    `object:handwritten-function:${sessionId}:${index}:${stroke.id}`,
  );
}

export function useBoardHandwritingController({
  announce,
  documentController,
  onPlotBuilt,
  recognizer,
}: UseBoardHandwritingControllerOptions) {
  const { commitCommand, createCommandMetadata, document, getDocument } =
    documentController;
  const [state, setState] = useState<HandwrittenFunctionSessionState>(
    initialHandwrittenFunctionSessionState,
  );
  const stateRef = useRef<HandwrittenFunctionSessionState>(
    initialHandwrittenFunctionSessionState,
  );
  const [sourceObjects, setSourceObjects] = useState<
    readonly PenStrokeObject[] | null
  >(null);
  const sourceObjectsRef = useRef<readonly PenStrokeObject[] | null>(null);
  const [interpretation, setInterpretation] =
    useState<HandwrittenFunctionInterpretation | null>(null);
  const [draft, setDraft] = useState("");
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const recognitionAbortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      recognitionAbortRef.current?.abort();
    },
    [],
  );

  const strokes = useMemo<readonly HandwrittenFunctionStroke[]>(() => {
    if (state.kind === "idle") return [];
    const active = state.kind === "collecting" ? state.activeStroke : null;
    return active !== null && active.points.length >= 2
      ? [...state.strokes, { id: active.id, points: active.points }]
      : state.strokes;
  }, [state]);

  const bounds = useMemo(
    () =>
      state.kind === "idle"
        ? null
        : state.kind === "collecting"
          ? calculateHandwrittenFunctionBounds(strokes)
          : state.bounds,
    [state, strokes],
  );

  const draftInterpretation = useMemo(
    () =>
      draft.trim().length === 0
        ? null
        : interpretHandwrittenFunctionDraft(draft),
    [draft],
  );
  const draftCandidate =
    draftInterpretation?.status === "accepted"
      ? draftInterpretation.selected
      : null;
  const draftIssue = useMemo(() => {
    if (draft.trim().length === 0) {
      return sourceObjects === null
        ? null
        : "Введите функцию для построения графика.";
    }
    if (draftCandidate !== null) return null;
    return (
      draftInterpretation?.diagnostics.find(
        ({ severity, code }) =>
          severity === "error" &&
          code !== "handwriting.interpretation.no-valid-candidate",
      )?.message ?? "Выражение пока нельзя построить."
    );
  }, [draft, draftCandidate, draftInterpretation, sourceObjects]);

  const plotObject = useMemo(() => {
    if (bounds === null || draftCandidate === null || state.kind === "idle") {
      return null;
    }
    const sessionId = state.sessionId;
    return createHandwrittenFunctionPlotObject({
      bounds,
      candidate: draftCandidate,
      ids: {
        objectId: boardObjectId(
          `object:handwritten-function-plot:${sessionId}`,
        ),
        parameterId: (_name, index) =>
          plotParameterId(
            `plot-parameter:handwritten-function:${sessionId}:${index}`,
          ),
        seriesId: plotSeriesId(`plot-series:handwritten-function:${sessionId}`),
      },
    });
  }, [bounds, draftCandidate, state]);

  const sourceApplies = useMemo(
    () =>
      sourceObjects !== null &&
      handwrittenFunctionSourceStillApplies(document, sourceObjects),
    [document, sourceObjects],
  );

  const previewItems = useMemo<readonly BoardRenderItem[]>(() => {
    const inkItems =
      sourceObjects !== null || state.kind === "idle"
        ? []
        : createHandwrittenFunctionStrokeObjects({
            ids: {
              objectId: (stroke, index) =>
                strokeObjectId(state.sessionId, stroke, index),
            },
            strokes,
          }).map((object) => ({ object, transforms: [] }));
    const plotItems =
      sourceObjects === null || plotObject === null
        ? []
        : [
            {
              object: {
                ...plotObject,
                style: { ...plotObject.style, opacity: 0.72 },
              },
              transforms: [],
            },
          ];
    return [...inkItems, ...plotItems];
  }, [plotObject, sourceObjects, state, strokes]);

  const applyAction = useCallback(
    (
      action: HandwrittenFunctionSessionAction,
    ): HandwrittenFunctionSessionState => {
      const result = reduceHandwrittenFunctionSession(stateRef.current, action);
      stateRef.current = result.state;
      setState(result.state);
      if (result.diagnostic !== null) {
        setDiagnostic(diagnosticMessage(result.diagnostic));
      }
      return result.state;
    },
    [],
  );

  const close = useCallback(() => {
    recognitionAbortRef.current?.abort();
    recognitionAbortRef.current = null;
    stateRef.current = initialHandwrittenFunctionSessionState;
    setState(initialHandwrittenFunctionSessionState);
    sourceObjectsRef.current = null;
    setSourceObjects(null);
    setInterpretation(null);
    setDraft("");
    setDiagnostic(null);
  }, []);

  const materializeInk = useCallback(
    (
      currentState: Exclude<
        HandwrittenFunctionSessionState,
        { readonly kind: "idle" }
      >,
    ): readonly PenStrokeObject[] | null => {
      const existing = sourceObjectsRef.current;
      if (existing !== null) return existing;
      if (currentState.strokes.length === 0) return null;
      const objects = createHandwrittenFunctionStrokeObjects({
        ids: {
          objectId: (stroke, index) =>
            strokeObjectId(currentState.sessionId, stroke, index),
        },
        strokes: currentState.strokes,
      });
      const committed = commitCommand({
        ...createCommandMetadata(),
        kind: "core.objects.add",
        objects,
      });
      if (!committed.ok) {
        setDiagnostic(committed.error.message);
        return null;
      }
      sourceObjectsRef.current = objects;
      setSourceObjects(objects);
      return objects;
    },
    [commitCommand, createCommandMetadata],
  );

  const preserveInk = useCallback((): boolean => {
    recognitionAbortRef.current?.abort();
    let currentState = stateRef.current;
    if (
      currentState.kind === "collecting" &&
      currentState.activeStroke !== null &&
      currentState.activeStroke.points.length >= 2
    ) {
      const point = currentState.activeStroke.points.at(-1)!;
      currentState = applyAction({
        kind: "finish-stroke",
        point,
        pointerId: currentState.activeStroke.pointerId,
      });
    }
    if (
      currentState.kind !== "idle" &&
      currentState.strokes.length > 0 &&
      sourceObjectsRef.current === null &&
      materializeInk(currentState) === null
    ) {
      return false;
    }
    close();
    announce("Рукописные штрихи оставлены на доске");
    return true;
  }, [announce, applyAction, close, materializeInk]);

  const clear = useCallback(() => {
    recognitionAbortRef.current?.abort();
    const originals = sourceObjectsRef.current;
    if (originals !== null) {
      const objectIds = originals
        .map(({ id }) => id)
        .filter((id) => getDocument().objects[id] !== undefined);
      if (objectIds.length > 0) {
        const removed = commitCommand({
          ...createCommandMetadata(),
          kind: "core.objects.delete",
          objectIds,
        });
        if (!removed.ok) {
          setDiagnostic(removed.error.message);
          return;
        }
      }
    }
    close();
    announce("Рукописный ввод очищен");
  }, [announce, close, commitCommand, createCommandMetadata, getDocument]);

  const recognize = useCallback(() => {
    let currentState = stateRef.current;
    if (currentState.kind === "idle" || currentState.kind === "recognizing") {
      return;
    }
    if (currentState.kind === "resolved" || currentState.kind === "failed") {
      currentState = applyAction({ kind: "reopen-input" });
    }
    if (currentState.kind === "collecting") {
      currentState = applyAction({ kind: "complete-input" });
    }
    if (currentState.kind !== "ready") return;
    const originals = materializeInk(currentState);
    if (originals === null) return;
    if (recognizer === undefined) {
      setDiagnostic("Штрихи сохранены. Введите функцию вручную.");
      announce("Штрихи сохранены для ручного ввода функции");
      return;
    }

    recognitionAbortRef.current?.abort();
    const recognitionId = `recognition:${crypto.randomUUID()}`;
    const request = createMathInkRecognitionRequest(
      currentState,
      recognitionId,
    );
    const started = applyAction({ kind: "recognition-started", recognitionId });
    if (started.kind !== "recognizing") return;
    const controller = new AbortController();
    recognitionAbortRef.current = controller;
    setDiagnostic(null);
    void recognizer
      .recognize(request, controller.signal)
      .then((result) => {
        const latest = stateRef.current;
        if (
          controller.signal.aborted ||
          latest.kind !== "recognizing" ||
          latest.recognitionId !== recognitionId
        ) {
          return;
        }
        const resolved = applyAction({
          kind: "recognition-resolved",
          recognitionId,
          result,
        });
        if (resolved.kind !== "resolved") return;
        const interpreted = interpretMathInkRecognitionResult(result);
        setInterpretation(interpreted);
        const expression =
          interpreted.selected?.expression ??
          interpreted.candidates[0]?.expression ??
          "";
        setDraft(expression);
        setDiagnostic(
          interpreted.status === "accepted"
            ? null
            : interpreted.status === "ambiguous"
              ? "Проверьте выбранный вариант или исправьте выражение."
              : "Введите функцию вручную или повторите распознавание.",
        );
        announce(
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
        const latest = stateRef.current;
        if (
          latest.kind !== "recognizing" ||
          latest.recognitionId !== recognitionId
        ) {
          return;
        }
        applyAction({
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
        setDiagnostic(
          error instanceof Error
            ? error.message
            : "Распознавание завершилось ошибкой.",
        );
        announce("Распознавание завершилось ошибкой; штрихи сохранены");
      })
      .finally(() => {
        if (recognitionAbortRef.current === controller) {
          recognitionAbortRef.current = null;
        }
      });
  }, [announce, applyAction, materializeInk, recognizer]);

  const buildPlot = useCallback(() => {
    const originals = sourceObjectsRef.current;
    if (
      originals === null ||
      plotObject === null ||
      !handwrittenFunctionSourceStillApplies(getDocument(), originals)
    ) {
      setDiagnostic("Исходные штрихи изменились. Запустите ввод заново.");
      return;
    }
    const result = commitCommand(
      createHandwrittenFunctionReplaceCommand(
        createCommandMetadata(),
        originals,
        plotObject,
      ),
    );
    if (!result.ok) {
      setDiagnostic(result.error.message);
      return;
    }
    close();
    onPlotBuilt(plotObject.id);
    announce("График рукописной функции построен");
  }, [
    announce,
    close,
    commitCommand,
    createCommandMetadata,
    getDocument,
    onPlotBuilt,
    plotObject,
  ]);

  const startStroke = useCallback(
    (sample: HandwritingPointerSample) => {
      let currentState = stateRef.current;
      const point = {
        timeMs: performance.now(),
        x: sample.point.x,
        y: sample.point.y,
      };
      if (currentState.kind === "idle") {
        currentState = applyAction({
          kind: "begin",
          sessionId: `handwriting-session:${crypto.randomUUID()}`,
          startedAtMs: point.timeMs,
        });
      }
      if (currentState.kind !== "collecting") return;
      setDiagnostic(null);
      applyAction({
        kind: "start-stroke",
        point,
        pointerId: sample.pointerId,
        strokeId: `handwriting-stroke:${crypto.randomUUID()}`,
      });
    },
    [applyAction],
  );

  const moveStroke = useCallback(
    (sample: HandwritingPointerSample) => {
      applyAction({
        kind: "append-point",
        point: {
          timeMs: performance.now(),
          x: sample.point.x,
          y: sample.point.y,
        },
        pointerId: sample.pointerId,
      });
    },
    [applyAction],
  );

  const moveStrokeBatch = useCallback(
    (samples: readonly HandwritingPointerSample[]) => {
      let currentState = stateRef.current;
      let batchDiagnostic: HandwrittenFunctionSessionDiagnosticCode | null =
        null;
      for (const sample of samples) {
        const result = reduceHandwrittenFunctionSession(currentState, {
          kind: "append-point",
          point: {
            timeMs: performance.now(),
            x: sample.point.x,
            y: sample.point.y,
          },
          pointerId: sample.pointerId,
        });
        currentState = result.state;
        batchDiagnostic = result.diagnostic ?? batchDiagnostic;
      }
      stateRef.current = currentState;
      setState(currentState);
      if (batchDiagnostic !== null) {
        setDiagnostic(diagnosticMessage(batchDiagnostic));
      }
    },
    [],
  );

  const finishStroke = useCallback(
    (sample: HandwritingPointerSample) => {
      applyAction({
        kind: "finish-stroke",
        point: {
          timeMs: performance.now(),
          x: sample.point.x,
          y: sample.point.y,
        },
        pointerId: sample.pointerId,
      });
    },
    [applyAction],
  );

  const cancelStroke = useCallback(
    (pointerId: number) => {
      applyAction({ kind: "cancel-stroke", pointerId });
    },
    [applyAction],
  );

  const canRecognize =
    state.kind !== "idle" &&
    state.kind !== "recognizing" &&
    state.strokes.length > 0 &&
    (state.kind !== "collecting" || state.activeStroke === null) &&
    (recognizer !== undefined || sourceObjects === null);
  const canBuild =
    state.kind !== "recognizing" &&
    draftCandidate !== null &&
    plotObject !== null &&
    sourceApplies;

  return {
    buildPlot,
    canBuild,
    canRecognize,
    cancelStroke,
    clear,
    diagnostic,
    draft,
    draftCandidate,
    draftIssue,
    finishStroke,
    interpretation,
    moveStroke,
    moveStrokeBatch,
    preserveInk,
    previewItems,
    recognizerAvailable: recognizer !== undefined,
    recognize,
    setDraft,
    sourcePersisted: sourceObjects !== null,
    startStroke,
    state,
  } as const;
}

export type BoardHandwritingController = ReturnType<
  typeof useBoardHandwritingController
>;
