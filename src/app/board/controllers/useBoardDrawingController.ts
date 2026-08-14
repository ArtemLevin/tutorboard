import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  boardObjectId,
  type BoardObjectId,
  type Vec2,
} from "../../../core/public";
import {
  createAddDrawingObjectCommand,
  getDrawingPreview,
  reduceDrawingInteraction,
  type DrawingAction,
  type DrawingInteractionState,
  type DrawingToolId,
  type UserDrawingObject,
} from "../../../modules/drawing/public";
import {
  createAcceptSmartInkCompositeCommand,
  createAcceptSmartInkProposalCommand,
  proposeSmartInkComposite,
  proposeSmartInkReplacement,
  smartInkProposalStillApplies,
} from "../../../modules/smart-ink/public";
import { useDrawingToolPreferences } from "../../board-chrome/tool-preferences";
import type { BoardDocumentController } from "./useBoardDocumentController";

const initialDrawingState: DrawingInteractionState = { kind: "idle" };
const polygonSides = 5;

interface DrawingPointerSample {
  readonly inputTimestampMs?: number | undefined;
  readonly point: Vec2;
  readonly pointerId: number;
  readonly pressure: number;
}

export interface UseBoardDrawingControllerOptions {
  readonly announce: (message: string) => void;
  readonly documentController: BoardDocumentController;
  readonly onTextInserted: (objectId: BoardObjectId) => void;
}

export function useBoardDrawingController({
  announce,
  documentController,
  onTextInserted,
}: UseBoardDrawingControllerOptions) {
  const { commitCommand, createCommandMetadata, getDocument } =
    documentController;
  const [state, setState] = useState(initialDrawingState);
  const stateRef = useRef<DrawingInteractionState>(initialDrawingState);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [smartInkNotice, setSmartInkNotice] = useState<string | null>(null);
  const recentSmartInkObjectIdsRef = useRef<BoardObjectId[]>([]);
  const [textDraft, setTextDraft] = useState("Новый текст");
  const { styleFor, updateStyle } = useDrawingToolPreferences();

  const preview = useMemo(() => getDrawingPreview(state), [state]);

  const commitObject = useCallback(
    (object: UserDrawingObject) =>
      commitCommand(
        createAddDrawingObjectCommand(createCommandMetadata(), object),
      ),
    [commitCommand, createCommandMetadata],
  );

  const applySmartInkComposite = useCallback(
    (objectId: BoardObjectId) => {
      const current = getDocument();
      const ids = [
        ...recentSmartInkObjectIdsRef.current.filter(
          (id) => current.objects[id] !== undefined && id !== objectId,
        ),
        objectId,
      ].slice(-6);
      recentSmartInkObjectIdsRef.current = ids;
      const recentObjects = ids.flatMap((id) => {
        const object = getDocument().objects[id];
        return object === undefined ? [] : [object];
      });
      const composite = proposeSmartInkComposite(recentObjects);
      if (composite === null) return;
      const accepted = commitCommand(
        createAcceptSmartInkCompositeCommand(
          createCommandMetadata(),
          composite,
        ),
      );
      if (accepted.ok) {
        recentSmartInkObjectIdsRef.current = [];
        setSmartInkNotice(null);
      }
    },
    [commitCommand, createCommandMetadata, getDocument],
  );

  const applyAction = useCallback(
    (action: DrawingAction, requestSmartInk = false) => {
      const result = reduceDrawingInteraction(stateRef.current, action);
      stateRef.current = result.state;
      setState(result.state);
      setDiagnostic(result.diagnostic);
      if (result.completedObject === null) return;
      const committed = commitObject(result.completedObject);
      if (
        !committed.ok ||
        !requestSmartInk ||
        result.completedObject.kind !== "drawing.pen-stroke"
      ) {
        return;
      }
      const proposed = proposeSmartInkReplacement(result.completedObject);
      if (proposed.status === "proposed") {
        const current = getDocument().objects[proposed.proposal.original.id];
        if (
          current?.kind === "drawing.pen-stroke" &&
          smartInkProposalStillApplies(proposed.proposal, current)
        ) {
          const accepted = commitCommand(
            createAcceptSmartInkProposalCommand(
              createCommandMetadata(),
              proposed.proposal,
            ),
          );
          setSmartInkNotice(
            accepted.ok
              ? null
              : "Smart Ink: автокоррекция фигуры завершилась ошибкой.",
          );
        } else {
          setSmartInkNotice(
            "Smart Ink: исходный штрих изменился до автокоррекции.",
          );
        }
      } else {
        setSmartInkNotice(
          proposed.recognizer.status === "ambiguous"
            ? "Smart Ink: форма неоднозначна, исходный штрих сохранён."
            : null,
        );
      }
      applySmartInkComposite(result.completedObject.id);
    },
    [
      applySmartInkComposite,
      commitCommand,
      commitObject,
      createCommandMetadata,
      getDocument,
    ],
  );

  const start = useCallback(
    (tool: DrawingToolId, sample: DrawingPointerSample) => {
      if (tool === "drawing.smart-ink") setSmartInkNotice(null);
      applyAction({
        kind: "start",
        objectId: boardObjectId(`object:${crypto.randomUUID()}`),
        ...(sample.inputTimestampMs === undefined
          ? {}
          : { inputTimestampMs: sample.inputTimestampMs }),
        point: sample.point,
        polygonSides,
        pointerId: sample.pointerId,
        pressure: sample.pressure,
        style: styleFor(tool),
        text: textDraft,
        tool,
      });
    },
    [applyAction, styleFor, textDraft],
  );

  const move = useCallback(
    (sample: DrawingPointerSample) => {
      applyAction({
        kind: "move",
        ...(sample.inputTimestampMs === undefined
          ? {}
          : { inputTimestampMs: sample.inputTimestampMs }),
        point: sample.point,
        pointerId: sample.pointerId,
        pressure: sample.pressure,
      });
    },
    [applyAction],
  );

  const moveBatch = useCallback((samples: readonly DrawingPointerSample[]) => {
    let current = stateRef.current;
    let latestDiagnostic: string | null = null;
    for (const sample of samples) {
      const result = reduceDrawingInteraction(current, {
        kind: "move",
        ...(sample.inputTimestampMs === undefined
          ? {}
          : { inputTimestampMs: sample.inputTimestampMs }),
        point: sample.point,
        pointerId: sample.pointerId,
        pressure: sample.pressure,
      });
      current = result.state;
      latestDiagnostic = result.diagnostic;
    }
    stateRef.current = current;
    setState(current);
    setDiagnostic(latestDiagnostic);
  }, []);

  const finish = useCallback(
    (tool: DrawingToolId, sample: DrawingPointerSample) => {
      applyAction(
        {
          kind: "finish",
          ...(sample.inputTimestampMs === undefined
            ? {}
            : { inputTimestampMs: sample.inputTimestampMs }),
          point: sample.point,
          pointerId: sample.pointerId,
          pressure: sample.pressure,
        },
        tool === "drawing.smart-ink",
      );
    },
    [applyAction],
  );

  const cancel = useCallback(
    (pointerId?: number) =>
      applyAction({
        kind: "cancel",
        ...(pointerId === undefined ? {} : { pointerId }),
      }),
    [applyAction],
  );

  const insertTextAt = useCallback(
    (point: Vec2) => {
      const pointerId = 0;
      const started = reduceDrawingInteraction(initialDrawingState, {
        kind: "start",
        objectId: boardObjectId(`object:${crypto.randomUUID()}`),
        point,
        pointerId,
        style: styleFor("drawing.text"),
        text: textDraft,
        tool: "drawing.text",
      });
      const finished = reduceDrawingInteraction(started.state, {
        kind: "finish",
        point,
        pointerId,
      });
      if (finished.completedObject === null) {
        setDiagnostic(finished.diagnostic);
        return;
      }
      if (!commitObject(finished.completedObject).ok) return;
      onTextInserted(finished.completedObject.id);
      announce("Текст добавлен");
    },
    [announce, commitObject, onTextInserted, styleFor, textDraft],
  );

  const resetSmartInkSession = useCallback(() => {
    recentSmartInkObjectIdsRef.current = [];
    setSmartInkNotice(null);
  }, []);

  useEffect(() => () => resetSmartInkSession(), [resetSmartInkSession]);

  return {
    cancel,
    diagnostic,
    finish,
    insertTextAt,
    move,
    moveBatch,
    preview,
    resetSmartInkSession,
    setSmartInkNotice,
    setTextDraft,
    smartInkNotice,
    start,
    state,
    styleFor,
    textDraft,
    updateStyle,
  } as const;
}

export type BoardDrawingController = ReturnType<
  typeof useBoardDrawingController
>;
