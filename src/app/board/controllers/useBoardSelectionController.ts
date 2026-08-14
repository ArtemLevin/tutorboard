import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BoardObjectTransformSnapshot } from "../../../adapters/canvas-konva/public";
import type {
  BoardObjectId,
  BoardSceneReadModel,
  Vec2,
  VisualStyleOverride,
} from "../../../core/public";
import {
  createGroupSelectionCommand,
  createReorderLayersCommand,
  createSetLayerVisibilityCommand,
  createUngroupSelectionCommand,
  selectLayers,
} from "../../../modules/layers/public";
import {
  createDeleteSelectionCommand,
  createMoveSelectionCommand,
  createSetSelectionLockCommand,
  createTransformSelectionCommand,
  expandSelectionObjectIds,
  getSelectionLasso,
  getSelectionMarquee,
  getSelectionPreviewDelta,
  initialSelectionState,
  normalizeRect,
  reduceSelectionInteraction,
  selectionIsLocked,
  selectObjectIdsInLasso,
  selectObjectIdsInRect,
  selectSelectionBounds,
  type CompletedSelectionMove,
  type SelectionAction,
  type SelectionState,
} from "../../../modules/selection/public";
import { createSetSelectionStyleCommand } from "../../../modules/styling/public";
import {
  createTextShapeGroupTransformCommand,
  inspectTextShapeFigure,
} from "../../../modules/text-shape-placement/public";
import {
  createUpdateTextCommand,
  isEditableTextObject,
} from "../../../modules/text-editing/public";
import { groupId } from "../../../core/public";
import type { BoardDocumentController } from "./useBoardDocumentController";

interface PointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
}

export interface UseBoardSelectionControllerOptions {
  readonly announce: (message: string) => void;
  readonly documentController: BoardDocumentController;
  readonly scene: BoardSceneReadModel;
}

export function useBoardSelectionController({
  announce,
  documentController,
  scene,
}: UseBoardSelectionControllerOptions) {
  const {
    commitCommand,
    createCommandMetadata,
    document,
    getDocument,
    setCommandError,
  } = documentController;
  const [state, setState] = useState<SelectionState>(initialSelectionState);
  const stateRef = useRef<SelectionState>(initialSelectionState);

  const replaceSelection = useCallback(
    (selectedObjectIds: readonly BoardObjectId[]) => {
      const next: SelectionState = {
        interaction: { kind: "idle" },
        selectedObjectIds,
      };
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  const getState = useCallback(() => stateRef.current, []);

  const ensureObjectSelected = useCallback(
    (objectId: BoardObjectId) => {
      const currentState = stateRef.current;
      if (currentState.selectedObjectIds.includes(objectId)) return;
      replaceSelection(expandSelectionObjectIds(getDocument(), [objectId]));
    },
    [getDocument, replaceSelection],
  );

  useEffect(() => {
    const result = reduceSelectionInteraction(stateRef.current, {
      availableObjectIds: document.order,
      kind: "prune",
    });
    stateRef.current = result.state;
    setState(result.state);
  }, [document.order]);

  const commitMove = useCallback(
    (completed: CompletedSelectionMove) => {
      const current = getDocument();
      commitCommand(
        createMoveSelectionCommand(
          createCommandMetadata(),
          current,
          completed.objectIds,
          completed.delta,
        ),
      );
    },
    [commitCommand, createCommandMetadata, getDocument],
  );

  const applyAction = useCallback(
    (action: SelectionAction) => {
      const result = reduceSelectionInteraction(stateRef.current, action);
      stateRef.current = result.state;
      setState(result.state);
      if (result.completedMove !== null) commitMove(result.completedMove);
    },
    [commitMove],
  );

  const start = useCallback(
    (input: {
      readonly additive: boolean;
      readonly areaKind: "lasso" | "marquee";
      readonly areaOperation?: "add" | "replace" | "subtract";
      readonly hitObjectIds: readonly BoardObjectId[];
      readonly point: Vec2;
      readonly pointerId: number;
    }) => {
      applyAction({
        additive: input.additive,
        areaKind: input.areaKind,
        areaOperation:
          input.areaOperation ?? (input.additive ? "add" : "replace"),
        hitObjectIds: input.hitObjectIds,
        kind: "start",
        point: input.point,
        pointerId: input.pointerId,
      });
    },
    [applyAction],
  );

  const move = useCallback(
    (sample: PointerSample) => {
      applyAction({
        kind: "move",
        point: sample.point,
        pointerId: sample.pointerId,
      });
    },
    [applyAction],
  );

  const finish = useCallback(
    (sample: PointerSample) => {
      const interaction = stateRef.current.interaction;
      const current = getDocument();
      const areaObjectIds =
        interaction.kind === "marquee"
          ? expandSelectionObjectIds(
              current,
              selectObjectIdsInRect(
                scene,
                normalizeRect(interaction.start, sample.point),
              ),
            )
          : interaction.kind === "lasso"
            ? expandSelectionObjectIds(
                current,
                selectObjectIdsInLasso(scene, [
                  ...interaction.points,
                  sample.point,
                ]),
              )
            : undefined;
      applyAction({
        kind: "finish",
        ...(areaObjectIds === undefined ? {} : { areaObjectIds }),
        point: sample.point,
        pointerId: sample.pointerId,
      });
      if (interaction.kind === "lasso") {
        announce(`Лассо завершено: выбрано ${areaObjectIds?.length ?? 0}`);
      }
    },
    [announce, applyAction, getDocument, scene],
  );

  const cancel = useCallback(
    (pointerId?: number) => {
      applyAction({
        kind: "cancel",
        ...(pointerId === undefined ? {} : { pointerId }),
      });
    },
    [applyAction],
  );

  const selectObject = useCallback(
    (objectId: BoardObjectId) => {
      const current = getDocument();
      replaceSelection(expandSelectionObjectIds(current, [objectId]));
    },
    [getDocument, replaceSelection],
  );

  const commitTransform = useCallback(
    (transforms: readonly BoardObjectTransformSnapshot[]) => {
      if (transforms.length === 0) return;
      const current = getDocument();
      try {
        const command = createTransformSelectionCommand(
          createCommandMetadata(),
          current,
          transforms,
        );
        if (commitCommand(command).ok)
          announce("Размер или поворот выделения изменён");
      } catch (error) {
        setCommandError(
          error instanceof Error ? error.message : "Transform is invalid.",
        );
      }
    },
    [
      announce,
      commitCommand,
      createCommandMetadata,
      getDocument,
      setCommandError,
    ],
  );

  const transformBy = useCallback(
    (scaleFactor: number, rotationDelta: number) => {
      const current = getDocument();
      const selectedIds = stateRef.current.selectedObjectIds;
      const figure = inspectTextShapeFigure(current, selectedIds);
      if (figure !== null) {
        const command = createTextShapeGroupTransformCommand({
          document: current,
          groupId: figure.groupId,
          metadata: createCommandMetadata(),
          rotationDelta,
          scaleFactor,
        });
        if (command !== null && commitCommand(command).ok) {
          announce("Размер или поворот фигуры изменён");
        }
        return;
      }
      const transforms = selectedIds.flatMap((objectId) => {
        const object = current.objects[objectId];
        if (
          object === undefined ||
          object.locked ||
          object.groupId !== null ||
          object.source.kind !== "user"
        ) {
          return [];
        }
        return [
          {
            objectId,
            position: object.position,
            rotation: object.rotation + rotationDelta,
            scale: {
              x: Math.min(100, Math.max(0.05, object.scale.x * scaleFactor)),
              y: Math.min(100, Math.max(0.05, object.scale.y * scaleFactor)),
            },
          },
        ];
      });
      commitTransform(transforms);
    },
    [
      announce,
      commitCommand,
      commitTransform,
      createCommandMetadata,
      getDocument,
    ],
  );

  const moveBy = useCallback(
    (delta: Vec2) => {
      const selectedIds = stateRef.current.selectedObjectIds;
      if (selectedIds.length === 0) return;
      commitMove({ delta, objectIds: selectedIds });
      announce(`Выделение перемещено: ${delta.x}, ${delta.y}`);
    },
    [announce, commitMove],
  );

  const setLocked = useCallback(
    (locked: boolean) => {
      const current = getDocument();
      commitCommand(
        createSetSelectionLockCommand(
          createCommandMetadata(),
          current,
          stateRef.current.selectedObjectIds,
          locked,
        ),
      );
    },
    [commitCommand, createCommandMetadata, getDocument],
  );

  const remove = useCallback(() => {
    const current = getDocument();
    commitCommand(
      createDeleteSelectionCommand(
        createCommandMetadata(),
        current,
        stateRef.current.selectedObjectIds,
      ),
    );
  }, [commitCommand, createCommandMetadata, getDocument]);

  const group = useCallback(() => {
    const current = getDocument();
    const objectIds = stateRef.current.selectedObjectIds;
    if (
      objectIds.length < 2 ||
      objectIds.some((id) => {
        const object = current.objects[id];
        return object?.groupId !== null || object.source.kind !== "user";
      })
    ) {
      return;
    }
    commitCommand(
      createGroupSelectionCommand(
        createCommandMetadata(),
        groupId(`group:${crypto.randomUUID()}`),
        objectIds,
      ),
    );
  }, [commitCommand, createCommandMetadata, getDocument]);

  const ungroup = useCallback(() => {
    const current = getDocument();
    commitCommand(
      createUngroupSelectionCommand(
        createCommandMetadata(),
        current,
        stateRef.current.selectedObjectIds,
      ),
    );
  }, [commitCommand, createCommandMetadata, getDocument]);

  const updateStyle = useCallback(
    (style: VisualStyleOverride) => {
      const selectedIds = stateRef.current.selectedObjectIds;
      if (selectedIds.length === 0) return;
      commitCommand(
        createSetSelectionStyleCommand(
          createCommandMetadata(),
          selectedIds,
          style,
        ),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const updateText = useCallback(
    (objectId: BoardObjectId, text: string) => {
      const object = getDocument().objects[objectId];
      if (!isEditableTextObject(object) || object.text === text) return;
      commitCommand(
        createUpdateTextCommand(createCommandMetadata(), objectId, text),
      );
    },
    [commitCommand, createCommandMetadata, getDocument],
  );

  const reorderLayer = useCallback(
    (objectId: BoardObjectId, mode: "back" | "front") => {
      commitCommand(
        createReorderLayersCommand(createCommandMetadata(), [objectId], mode),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const setLayerVisibility = useCallback(
    (objectId: BoardObjectId, visible: boolean) => {
      commitCommand(
        createSetLayerVisibilityCommand(
          createCommandMetadata(),
          [objectId],
          visible,
        ),
      );
    },
    [commitCommand, createCommandMetadata],
  );

  const setLayerLock = useCallback(
    (objectId: BoardObjectId, locked: boolean) => {
      const current = getDocument();
      commitCommand(
        createSetSelectionLockCommand(
          createCommandMetadata(),
          current,
          expandSelectionObjectIds(current, [objectId]),
          locked,
        ),
      );
    },
    [commitCommand, createCommandMetadata, getDocument],
  );

  const selectedObjects = useMemo(
    () =>
      state.selectedObjectIds.flatMap((id) => {
        const object = document.objects[id];
        return object === undefined ? [] : [object];
      }),
    [document.objects, state.selectedObjectIds],
  );
  const selectedLocked = useMemo(
    () => selectionIsLocked(document, state.selectedObjectIds),
    [document, state.selectedObjectIds],
  );
  const previewDelta = useMemo(() => getSelectionPreviewDelta(state), [state]);
  const marquee = useMemo(() => getSelectionMarquee(state), [state]);
  const lasso = useMemo(() => getSelectionLasso(state), [state]);
  const bounds = useMemo(
    () => selectSelectionBounds(scene, state.selectedObjectIds),
    [scene, state.selectedObjectIds],
  );
  const layers = useMemo(() => selectLayers(document), [document]);
  const selectedStyle = scene.items.find(({ object }) =>
    state.selectedObjectIds.includes(object.id),
  )?.object.style;
  const selectedTextId =
    state.selectedObjectIds.length === 1
      ? state.selectedObjectIds[0]
      : undefined;
  const selectedEditableText =
    selectedTextId === undefined ? undefined : document.objects[selectedTextId];
  const transformableObjectIds =
    state.interaction.kind === "idle" &&
    selectedObjects.length > 0 &&
    selectedObjects.every(
      (object) =>
        !object.locked &&
        object.groupId === null &&
        object.source.kind === "user",
    )
      ? state.selectedObjectIds
      : [];
  const canGroup =
    selectedObjects.length >= 2 &&
    selectedObjects.every(
      (object) => object.groupId === null && object.source.kind === "user",
    );
  const selectedGroupIds = [
    ...new Set(
      selectedObjects.flatMap(({ groupId: selectedGroupId }) =>
        selectedGroupId === null ? [] : [selectedGroupId],
      ),
    ),
  ];
  const importRootGroupIds = new Set(
    Object.values(document.geometryImports).flatMap((record) =>
      record === undefined ? [] : [record.rootGroupId],
    ),
  );
  const canUngroup =
    selectedGroupIds.length > 0 &&
    selectedGroupIds.every((id) => !importRootGroupIds.has(id));

  return {
    applyAction,
    bounds,
    canGroup,
    canUngroup,
    cancel,
    commitMove,
    commitTransform,
    ensureObjectSelected,
    finish,
    getState,
    group,
    lasso,
    layers,
    marquee,
    move,
    moveBy,
    previewDelta: selectedLocked ? null : previewDelta,
    remove,
    reorderLayer,
    replaceSelection,
    selectObject,
    selectedEditableText,
    selectedLocked,
    selectedObjects,
    selectedStyle,
    setLayerLock,
    setLayerVisibility,
    setLocked,
    start,
    state,
    transformBy,
    transformableObjectIds,
    ungroup,
    updateStyle,
    updateText,
  } as const;
}

export type BoardSelectionController = ReturnType<
  typeof useBoardSelectionController
>;
