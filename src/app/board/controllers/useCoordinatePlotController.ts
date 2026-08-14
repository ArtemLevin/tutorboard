import { useCallback, useMemo, useState } from "react";

import {
  zoomCoordinatePlotViewportAt,
  type CoordinatePlotRenderInteraction,
  type CoordinatePlotZoomAxis,
} from "../../../adapters/canvas-konva/public";
import {
  boardObjectId,
  plotParameterId,
  plotSeriesId,
  type BoardObjectId,
  type CoordinatePlotDefinition,
  type PlotSeries,
  type PlotSeriesId,
  type Vec2,
} from "../../../core/public";
import {
  addCoordinatePlotParameter,
  addCoordinatePlotSeries,
  createDefaultCoordinatePlotObject,
  fitCoordinatePlotDefinition,
  resetCoordinatePlotViewport,
  updateCoordinatePlotSeriesInput,
  validateCoordinatePlotEditorDefinition,
} from "../../../modules/coordinate-plot-editor/public";
import type { BoardDocumentController } from "./useBoardDocumentController";

export interface CoordinatePlotEditorSession {
  readonly draft: CoordinatePlotDefinition;
  readonly expected: CoordinatePlotDefinition;
  readonly objectId: BoardObjectId;
  readonly selectedSeriesId: PlotSeriesId | null;
  readonly zoomAxis: CoordinatePlotZoomAxis;
}

export interface UseCoordinatePlotControllerOptions {
  readonly announce: (message: string) => void;
  readonly documentController: BoardDocumentController;
  readonly onSelectPlot: (objectId: BoardObjectId) => void;
  readonly readOnly: boolean;
  readonly resolvePlacementCenter: () => Vec2;
}

export function useCoordinatePlotController({
  announce,
  documentController,
  onSelectPlot,
  readOnly,
  resolvePlacementCenter,
}: UseCoordinatePlotControllerOptions) {
  const { commitCommand, createCommandMetadata, getDocument, setCommandError } =
    documentController;
  const [editor, setEditor] = useState<CoordinatePlotEditorSession | null>(
    null,
  );

  const beginEditing = useCallback(
    (objectId: BoardObjectId) => {
      if (editor !== null && editor.objectId === objectId) return;
      if (editor !== null && editor.draft !== editor.expected) {
        announce(
          "Сначала сохраните или закройте текущий редактор координатной плоскости.",
        );
        return;
      }
      const current = getDocument();
      const object = current.objects[objectId];
      const groupLocked =
        object?.groupId === null || object?.groupId === undefined
          ? false
          : current.groups[object.groupId]?.locked === true;
      if (
        object?.kind !== "math.coordinate-plot" ||
        object.source.kind !== "user" ||
        object.locked ||
        groupLocked
      ) {
        setCommandError(
          "Для редактирования выберите разблокированную пользовательскую координатную плоскость.",
        );
        return;
      }
      onSelectPlot(object.id);
      setEditor({
        draft: object.definition,
        expected: object.definition,
        objectId: object.id,
        selectedSeriesId:
          object.definition.series.find(({ visible }) => visible)?.id ??
          object.definition.series[0]?.id ??
          null,
        zoomAxis: "both",
      });
    },
    [announce, editor, getDocument, onSelectPlot, setCommandError],
  );

  const create = useCallback(() => {
    const token = crypto.randomUUID();
    let seriesSequence = 0;
    let parameterSequence = 0;
    const object = createDefaultCoordinatePlotObject({
      center: resolvePlacementCenter(),
      ids: {
        objectId: boardObjectId(`object:plot:${token}`),
        parameterId: () =>
          plotParameterId(`plot-parameter:${token}:${parameterSequence++}`),
        seriesId: () =>
          plotSeriesId(`plot-series:${token}:${seriesSequence++}`),
      },
    });
    const result = commitCommand({
      ...createCommandMetadata(),
      kind: "core.objects.add",
      objects: [object],
    });
    if (result.ok) onSelectPlot(object.id);
  }, [
    commitCommand,
    createCommandMetadata,
    onSelectPlot,
    resolvePlacementCenter,
  ]);

  const updateDraft = useCallback((definition: CoordinatePlotDefinition) => {
    setEditor((current) =>
      current === null ? null : { ...current, draft: definition },
    );
  }, []);

  const selectSeries = useCallback(
    (objectId: BoardObjectId, seriesId: PlotSeriesId | null) => {
      setEditor((current) =>
        current === null || current.objectId !== objectId
          ? current
          : { ...current, selectedSeriesId: seriesId },
      );
    },
    [],
  );

  const updateViewport = useCallback(
    (
      objectId: BoardObjectId,
      viewport: CoordinatePlotDefinition["coordinateViewport"],
    ) => {
      setEditor((current) =>
        current === null || current.objectId !== objectId
          ? current
          : {
              ...current,
              draft: { ...current.draft, coordinateViewport: viewport },
            },
      );
    },
    [],
  );

  const commitViewport = useCallback(
    (
      objectId: BoardObjectId,
      viewport: CoordinatePlotDefinition["coordinateViewport"],
    ): boolean => {
      const current = getDocument();
      const object = current.objects[objectId];
      if (
        readOnly ||
        object?.kind !== "math.coordinate-plot" ||
        object.source.kind !== "user" ||
        object.locked ||
        (object.groupId !== null &&
          current.groups[object.groupId]?.locked === true)
      ) {
        return false;
      }
      const expected = object.definition;
      const previous = expected.coordinateViewport;
      if (
        previous.equalScale === viewport.equalScale &&
        previous.xMax === viewport.xMax &&
        previous.xMin === viewport.xMin &&
        previous.yMax === viewport.yMax &&
        previous.yMin === viewport.yMin
      ) {
        return true;
      }
      const result = commitCommand({
        ...createCommandMetadata(),
        expected,
        kind: "core.coordinate-plot.update",
        objectId,
        replacement: { ...expected, coordinateViewport: viewport },
      });
      if (result.ok) announce("Диапазон координатной плоскости изменён");
      return result.ok;
    },
    [announce, commitCommand, createCommandMetadata, getDocument, readOnly],
  );

  const setZoomAxis = useCallback((zoomAxis: CoordinatePlotZoomAxis) => {
    setEditor((current) =>
      current === null ? null : { ...current, zoomAxis },
    );
  }, []);

  const zoom = useCallback((factor: number) => {
    setEditor((current) => {
      if (current === null) return null;
      const size = current.draft.size;
      return {
        ...current,
        draft: {
          ...current.draft,
          coordinateViewport: zoomCoordinatePlotViewportAt(
            current.draft.coordinateViewport,
            size,
            { x: size.width / 2, y: size.height / 2 },
            factor,
            current.zoomAxis,
          ),
        },
      };
    });
  }, []);

  const resetViewport = useCallback(() => {
    setEditor((current) =>
      current === null
        ? null
        : { ...current, draft: resetCoordinatePlotViewport(current.draft) },
    );
  }, []);

  const fitViewport = useCallback(() => {
    setEditor((current) =>
      current === null
        ? null
        : { ...current, draft: fitCoordinatePlotDefinition(current.draft) },
    );
  }, []);

  const save = useCallback((): boolean => {
    const session = editor;
    if (
      session === null ||
      readOnly ||
      session.draft === session.expected ||
      validateCoordinatePlotEditorDefinition(session.draft).some(
        ({ blocking }) => blocking,
      )
    ) {
      return false;
    }
    const result = commitCommand({
      ...createCommandMetadata(),
      expected: session.expected,
      kind: "core.coordinate-plot.update",
      objectId: session.objectId,
      replacement: session.draft,
    });
    if (!result.ok) return false;
    setEditor((current) =>
      current === null || current.objectId !== session.objectId
        ? current
        : { ...current, expected: session.draft },
    );
    announce("Координатная плоскость сохранена");
    return true;
  }, [announce, commitCommand, createCommandMetadata, editor, readOnly]);

  const addSeries = useCallback(
    (kind: PlotSeries["kind"], expression?: string) => {
      const id = plotSeriesId(`plot-series:${crypto.randomUUID()}`);
      setEditor((current) => {
        if (current === null) return null;
        const added = addCoordinatePlotSeries(current.draft, kind, id);
        const draft =
          expression === undefined
            ? added
            : updateCoordinatePlotSeriesInput(added, id, expression);
        return { ...current, draft, selectedSeriesId: id };
      });
    },
    [],
  );

  const addParameter = useCallback((name?: string) => {
    const id = plotParameterId(`plot-parameter:${crypto.randomUUID()}`);
    setEditor((current) =>
      current === null
        ? null
        : {
            ...current,
            draft: addCoordinatePlotParameter(current.draft, id, name),
          },
    );
  }, []);

  const issues = useMemo(
    () =>
      editor === null
        ? []
        : validateCoordinatePlotEditorDefinition(editor.draft),
    [editor],
  );

  const renderInteraction = useMemo<CoordinatePlotRenderInteraction>(
    () => ({
      activeObjectId: editor?.objectId ?? null,
      selectedSeriesId: editor?.selectedSeriesId ?? null,
      zoomAxis: editor?.zoomAxis ?? "both",
      ...(editor === null ? {} : { definitionOverride: editor.draft }),
      onSelectedSeriesChange: selectSeries,
      onSettingsRequest: beginEditing,
      onViewportChange: updateViewport,
      onViewportCommit: commitViewport,
    }),
    [beginEditing, commitViewport, editor, selectSeries, updateViewport],
  );

  return {
    addParameter,
    addSeries,
    beginEditing,
    close: () => setEditor(null),
    create,
    editor,
    fitViewport,
    issues,
    renderInteraction,
    resetViewport,
    save,
    selectSeries,
    setZoomAxis,
    updateDraft,
    updateViewport,
    zoom,
  } as const;
}

export type CoordinatePlotController = ReturnType<
  typeof useCoordinatePlotController
>;
