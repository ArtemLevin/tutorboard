import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  boardObjectId,
  type BoardObjectId,
  type Vec2,
} from "../../../core/public";
import {
  createAddDrawingObjectCommand,
  getDrawingConstraintFeedback,
  getDrawingPreview,
  reduceDrawingInteraction,
  reduceDrawingInteractionBatch,
  type DrawingAction,
  type DrawingInteractionState,
  type DrawingToolId,
  type UserDrawingObject,
} from "../../../modules/drawing/public";
import type { InputModifiers } from "../../../shared/input-modifiers";
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
  readonly modifiers?: InputModifiers | undefined;
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
  const [textDraft, setTextDraftState] = useState("Новый текст");
  const { styleFor, updateStyle } = useDrawingToolPreferences();

  const preview = useMemo(() => getDrawingPreview(state), [state]);
  const constraintFeedback = useMemo(
    () => getDrawingConstraintFeedback(state),
    [state],
  );

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
      const suppressPenMoveRender =
        action.kind === "move" && stateRef.current.kind === "drawing-pen";
      const result = reduceDrawingInteraction(stateRef.current, action);
      stateRef.current = result.state;
      if (!suppressPenMoveRender) setState(result.state);
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

  const setTextDraft = useCallback(
    (value: string) => {
      setTextDraftState(value);
      const current = stateRef.current;
      if (current.kind !== "placing-text") return;
      applyAction({
        kind: "text-change",
        pointerId: current.pointerId,
        text: value,
      });
    },
    [applyAction],
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
        ...(sample.modifiers === undefined
          ? {}
          : { modifiers: sample.modifiers }),
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
        ...(sample.modifiers === undefined
          ? {}
          : { modifiers: sample.modifiers }),
        point: sample.point,
        pointerId: sample.pointerId,
        pressure: sample.pressure,
      });
    },
    [applyAction],
  );

  const moveBatch = useCallback((samples: readonly DrawingPointerSample[]) => {
    if (samples.length === 0) return;
    const previous = stateRef.current;
    const result = reduceDrawingInteractionBatch(
      previous,
      samples.map((sample) => ({
        kind: "move" as const,
        ...(sample.inputTimestampMs === undefined
          ? {}
          : { inputTimestampMs: sample.inputTimestampMs }),
        ...(sample.modifiers === undefined
          ? {}
          : { modifiers: sample.modifiers }),
        point: sample.point,
        pointerId: sample.pointerId,
        pressure: sample.pressure,
      })),
    );
    stateRef.current = result.state;
    if (previous.kind !== "drawing-pen") setState(result.state);
    setDiagnostic(result.diagnostic);
  }, []);

  const finish = useCallback(
    (tool: DrawingToolId, sample: DrawingPointerSample) => {
      applyAction(
        {
          kind: "finish",
          ...(sample.inputTimestampMs === undefined
            ? {}
            : { inputTimestampMs: sample.inputTimestampMs }),
          ...(sample.modifiers === undefined
            ? {}
            : { modifiers: sample.modifiers }),
          point: sample.point,
          pointerId: sample.pointerId,
          pressure: sample.pressure,
        },
        tool === "drawing.smart-ink",
      );
    },
    [applyAction],
  );

  const modifiersChange = useCallback(
    (sample: {
      readonly modifiers: InputModifiers;
      readonly pointerId: number;
    }) => {
      applyAction({
        kind: "modifiers",
        modifiers: sample.modifiers,
        pointerId: sample.pointerId,
      });
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

  const commitTextPlacement = useCallback(() => {
    const current = stateRef.current;
    if (current.kind !== "placing-text") return false;
    const finished = reduceDrawingInteraction(current, {
      kind: "finish",
      point: current.position,
      pointerId: current.pointerId,
    });
    stateRef.current = finished.state;
    setState(finished.state);
    setDiagnostic(finished.diagnostic);
    if (finished.completedObject === null) return false;
    if (!commitObject(finished.completedObject).ok) return false;
    onTextInserted(finished.completedObject.id);
    announce("Текст добавлен");
    return true;
  }, [announce, commitObject, onTextInserted]);

  const insertTextAt = useCallback(
    (point: Vec2) => {
      if (stateRef.current.kind !== "idle") cancel();
      applyAction({
        kind: "start",
        objectId: boardObjectId(`object:${crypto.randomUUID()}`),
        point,
        pointerId: 0,
        style: styleFor("drawing.text"),
        text: textDraft,
        tool: "drawing.text",
      });
    },
    [applyAction, cancel, styleFor, textDraft],
  );

  const resetSmartInkSession = useCallback(() => {
    recentSmartInkObjectIdsRef.current = [];
    setSmartInkNotice(null);
  }, []);

  useEffect(() => () => resetSmartInkSession(), [resetSmartInkSession]);

  return {
    cancel,
    commitTextPlacement,
    constraintFeedback,
    diagnostic,
    finish,
    insertTextAt,
    modifiersChange,
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
