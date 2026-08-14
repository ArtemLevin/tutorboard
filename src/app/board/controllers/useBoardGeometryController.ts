import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SelectionPointerStartSample } from "../../../adapters/canvas-konva/public";
import type {
  ActorId,
  BoardObjectId,
  BoardSceneReadModel,
  GeometryOsClient,
  Vec2,
} from "../../../core/public";
import {
  startGeometryPrompt,
  type GeometryPromptOperation,
  type GeometryPromptResult,
} from "../../../modules/geometry-prompt/public";
import { createSetLayerVisibilityCommand } from "../../../modules/layers/public";
import {
  createTextShapeContourPointCommand,
  createTextShapePlacementCommand,
  createVertexConstructionCommand,
  inspectTextShapeFigure,
  inspectTextShapeVertex,
  inspectTextShapeVertexNearPoint,
  resolveTextShape,
  suggestTextShapes,
  type TextShapeDefinition,
  type VertexConstructionKind,
} from "../../../modules/text-shape-placement/public";
import type { GeometryPromptViewState } from "../../GeometryPromptPanel";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardSelectionController } from "./useBoardSelectionController";

type PendingGeometryPlacement =
  | { readonly definition: TextShapeDefinition; readonly kind: "catalog" }
  | { readonly kind: "geometryos"; readonly prompt: string };

export interface UseBoardGeometryControllerOptions {
  readonly actorId: ActorId;
  readonly announce: (message: string) => void;
  readonly client?: GeometryOsClient | undefined;
  readonly documentController: BoardDocumentController;
  readonly onArmPlacement: () => void;
  readonly onInspectObject: (objectId: BoardObjectId) => void;
  readonly onPlacementFinished: () => void;
  readonly onRemotePlacementStarted: () => void;
  readonly onSelectionCreated: (
    objectIds: readonly BoardObjectId[],
    inspectorId: BoardObjectId | null,
  ) => void;
  readonly selection: BoardSelectionController;
}

export function useBoardGeometryController({
  actorId,
  announce,
  client,
  documentController,
  onArmPlacement,
  onInspectObject,
  onPlacementFinished,
  onRemotePlacementStarted,
  onSelectionCreated,
  selection,
}: UseBoardGeometryControllerOptions) {
  const { commitCommand, createCommandMetadata, document, getDocument } =
    documentController;
  const [open, setOpen] = useState(false);
  const [prompt, setPromptValue] = useState(
    "Построй треугольник ABC и высоту AH",
  );
  const [autoLabelVertices, setAutoLabelVertices] = useState(true);
  const [pending, setPending] = useState<PendingGeometryPlacement | null>(null);
  const [state, setState] = useState<GeometryPromptViewState>({ kind: "idle" });
  const [vertexObjectId, setVertexObjectId] = useState<BoardObjectId | null>(
    null,
  );
  const operationRef = useRef<GeometryPromptOperation | null>(null);
  const lastRemotePlacementRef = useRef<{
    readonly point: Vec2;
    readonly prompt: string;
  } | null>(null);
  const contourPointerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      operationRef.current?.cancel();
    },
    [],
  );

  const suggestions = useMemo(() => suggestTextShapes(prompt, 8), [prompt]);
  const selectedFigure = useMemo(
    () => inspectTextShapeFigure(document, selection.state.selectedObjectIds),
    [document, selection.state.selectedObjectIds],
  );
  const selectedVertex = useMemo(
    () =>
      vertexObjectId === null
        ? null
        : inspectTextShapeVertex(document, vertexObjectId),
    [document, vertexObjectId],
  );
  const effectiveVertexObjectId = selectedVertex?.vertexObjectId ?? null;

  const applyResult = useCallback(
    (result: GeometryPromptResult) => {
      if (result.kind === "cancelled") {
        setState({ kind: "idle" });
        return;
      }
      const lastRequestId = result.requestIds.at(-1);
      if (result.kind === "needs-clarification") {
        if (lastRequestId !== undefined) {
          setState({
            kind: "needs-clarification",
            ambiguities: result.ambiguities,
            requestId: lastRequestId,
          });
        }
        return;
      }
      if (result.kind === "domain-error") {
        if (lastRequestId !== undefined) {
          setState({
            kind: "domain-error",
            requestId: lastRequestId,
            warnings: result.warnings,
          });
        }
        return;
      }
      if (result.kind === "failure") {
        setState(result);
        return;
      }
      const applied = commitCommand(result.command);
      if (!applied.ok) {
        setState({
          kind: "failure",
          code: applied.error.code,
          requestId: lastRequestId ?? null,
          retryable: false,
          stage: "import",
        });
        return;
      }
      onSelectionCreated([...result.command.importRecord.boardObjectIds], null);
      if (lastRequestId !== undefined) {
        setState({
          kind: "success",
          objectCount: result.command.objects.length,
          requestId: lastRequestId,
        });
      }
    },
    [commitCommand, onSelectionCreated],
  );

  const runRemoteAt = useCallback(
    (targetWorldCenter: Vec2, rawPrompt: string) => {
      if (client === undefined) return;
      operationRef.current?.cancel();
      const enrichedPrompt = `${rawPrompt.trim()}. ${
        autoLabelVertices
          ? "Подпиши все вершины латинскими буквами."
          : "Оставь вершины без подписей."
      }`;
      lastRemotePlacementRef.current = {
        point: targetWorldCenter,
        prompt: rawPrompt,
      };
      const operation = startGeometryPrompt({
        actorId,
        client,
        createToken: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
        onProgress: (progress) => setState({ kind: "running", ...progress }),
        prompt: enrichedPrompt,
        targetWorldCenter,
      });
      operationRef.current = operation;
      void operation.result.then((result) => {
        if (operationRef.current !== operation) return;
        operationRef.current = null;
        applyResult(result);
      });
    },
    [actorId, applyResult, autoLabelVertices, client],
  );

  const armPlacement = useCallback(() => {
    const resolved = resolveTextShape(prompt);
    if (resolved !== undefined) {
      setPending({ definition: resolved, kind: "catalog" });
      setState({
        kind: "awaiting-placement",
        label: resolved.label,
        source: "catalog",
      });
      onArmPlacement();
      return;
    }
    if (client === undefined) {
      setState({
        code: "geometryos.unavailable",
        kind: "failure",
        requestId: null,
        retryable: false,
        stage: "generate",
      });
      return;
    }
    const trimmed = prompt.trim();
    setPending({ kind: "geometryos", prompt: trimmed });
    setState({
      kind: "awaiting-placement",
      label: "Построение по тексту",
      source: "geometryos",
    });
    onArmPlacement();
  }, [client, onArmPlacement, prompt]);

  const placeAt = useCallback(
    (point: Vec2) => {
      const currentPending = pending;
      if (currentPending === null) return;
      setPending(null);
      if (currentPending.kind === "geometryos") {
        onRemotePlacementStarted();
        runRemoteAt(point, currentPending.prompt);
        return;
      }
      const command = createTextShapePlacementCommand({
        autoLabelVertices,
        definition: currentPending.definition,
        metadata: createCommandMetadata(),
        placement: point,
        token: crypto.randomUUID(),
      });
      const result = commitCommand(command);
      if (!result.ok) {
        setState({
          code: result.error.code,
          kind: "failure",
          requestId: null,
          retryable: false,
          stage: "import",
        });
        return;
      }
      onSelectionCreated(
        command.objects.map(({ id }) => id),
        command.objects[0]?.id ?? null,
      );
      setOpen(false);
      setState({
        kind: "success",
        objectCount: command.objects.length,
        requestId: null,
      });
      announce(`${currentPending.definition.label} построена`);
      onPlacementFinished();
    },
    [
      announce,
      autoLabelVertices,
      commitCommand,
      createCommandMetadata,
      onPlacementFinished,
      onRemotePlacementStarted,
      onSelectionCreated,
      pending,
      runRemoteAt,
    ],
  );

  const retry = useCallback(() => {
    const previous = lastRemotePlacementRef.current;
    if (previous !== null) runRemoteAt(previous.point, previous.prompt);
  }, [runRemoteAt]);

  const cancelOperation = useCallback(() => operationRef.current?.cancel(), []);

  const changePrompt = useCallback((value: string) => {
    setPromptValue(value);
    setState((current) =>
      current.kind === "running" ? current : { kind: "idle" },
    );
  }, []);

  const chooseClarification = useCallback((value: string) => {
    setPromptValue(value);
    setState({ kind: "idle" });
  }, []);

  const chooseSuggestion = useCallback((definition: TextShapeDefinition) => {
    setPromptValue(definition.label);
    setState({ kind: "idle" });
  }, []);

  const tryAddContourPoint = useCallback(
    (sample: SelectionPointerStartSample): boolean => {
      if (!sample.additive || sample.objectId === null) return false;
      const command = createTextShapeContourPointCommand({
        document: getDocument(),
        hitObjectId: sample.objectId,
        metadata: createCommandMetadata(),
        token: crypto.randomUUID(),
        worldPoint: sample.point,
      });
      if (command === null) return false;
      contourPointerRef.current = sample.pointerId;
      if (commitCommand(command).ok) {
        const label = command.objects.find(
          (object) => object.kind === "drawing.text",
        );
        announce(`На контуре добавлена точка ${label?.text ?? ""}`.trim());
      }
      return true;
    },
    [announce, commitCommand, createCommandMetadata, getDocument],
  );

  const inspectVertexNear = useCallback(
    (sample: SelectionPointerStartSample, scene: BoardSceneReadModel) => {
      const vertex = inspectTextShapeVertexNearPoint({
        document: getDocument(),
        hitObjectId: sample.objectId,
        maximumDistance: 18 / scene.viewport.zoom,
        point: sample.point,
        scene,
      });
      setVertexObjectId(vertex?.vertexObjectId ?? null);
      if (vertex !== null) onInspectObject(vertex.vertexObjectId);
      return vertex;
    },
    [getDocument, onInspectObject],
  );

  const inspectObjectVertex = useCallback(
    (objectId: BoardObjectId) => {
      const vertex = inspectTextShapeVertex(getDocument(), objectId);
      setVertexObjectId(vertex?.vertexObjectId ?? null);
      return vertex;
    },
    [getDocument],
  );

  const consumeContourPointer = useCallback((pointerId: number): boolean => {
    if (contourPointerRef.current !== pointerId) return false;
    contourPointerRef.current = null;
    return true;
  }, []);

  const buildVertexConstruction = useCallback(
    (kind: VertexConstructionKind) => {
      if (effectiveVertexObjectId === null) return;
      const command = createVertexConstructionCommand({
        document: getDocument(),
        kind,
        metadata: createCommandMetadata(),
        token: crypto.randomUUID(),
        vertexObjectId: effectiveVertexObjectId,
      });
      if (command !== null && commitCommand(command).ok) {
        announce("Дополнительное построение добавлено");
      }
    },
    [
      announce,
      commitCommand,
      createCommandMetadata,
      effectiveVertexObjectId,
      getDocument,
    ],
  );

  const setLabelsVisible = useCallback(
    (visible: boolean) => {
      const figure = inspectTextShapeFigure(
        getDocument(),
        selection.getState().selectedObjectIds,
      );
      if (figure === null || figure.labelObjectIds.length === 0) return;
      commitCommand(
        createSetLayerVisibilityCommand(
          createCommandMetadata(),
          figure.labelObjectIds,
          visible,
        ),
      );
    },
    [commitCommand, createCommandMetadata, getDocument, selection],
  );

  const moveLabels = useCallback(
    (delta: Vec2) => {
      const current = getDocument();
      const figure = inspectTextShapeFigure(
        current,
        selection.getState().selectedObjectIds,
      );
      if (figure === null || figure.labelObjectIds.length === 0) return;
      if (
        commitCommand({
          ...createCommandMetadata(),
          delta,
          kind: "core.objects.move",
          objectIds: figure.labelObjectIds,
        }).ok
      ) {
        announce("Положение подписей вершин изменено");
      }
    },
    [announce, commitCommand, createCommandMetadata, getDocument, selection],
  );

  return {
    armPlacement,
    autoLabelVertices,
    buildVertexConstruction,
    cancelOperation,
    changePrompt,
    chooseClarification,
    chooseSuggestion,
    consumeContourPointer,
    inspectObjectVertex,
    inspectVertexNear,
    moveLabels,
    open,
    pending,
    placeAt,
    prompt,
    remoteAvailable: client !== undefined,
    retry,
    selectedFigure,
    selectedVertex,
    setAutoLabelVertices,
    setLabelsVisible,
    setOpen,
    state,
    suggestions,
    tryAddContourPoint,
    vertexObjectId: effectiveVertexObjectId,
  } as const;
}

export type BoardGeometryController = ReturnType<
  typeof useBoardGeometryController
>;
