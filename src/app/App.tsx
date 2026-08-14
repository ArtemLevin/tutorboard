import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  actorId,
  createBoardSceneSelector,
  createEmptyBoardDocument,
  documentId,
  screenToWorld,
  type ActorId,
  type BoardCommand,
  type BoardDocument,
  type BoardObjectId,
  type GeometryOsClient,
  type Vec2,
  type ViewportState,
} from "../core/public";
import {
  geometryPlacementToolId,
  navigationToolId,
  selectionToolId,
  type ActiveToolId,
} from "./board/active-tool";
import { useBoardClipboardController } from "./board/controllers/useBoardClipboardController";
import { useBoardDocumentController } from "./board/controllers/useBoardDocumentController";
import { useBoardDrawingController } from "./board/controllers/useBoardDrawingController";
import { useBoardGeometryController } from "./board/controllers/useBoardGeometryController";
import { useBoardHandwritingController } from "./board/controllers/useBoardHandwritingController";
import { useBoardInteractionRouter } from "./board/controllers/useBoardInteractionRouter";
import { useBoardKeyboardShortcuts } from "./board/controllers/useBoardKeyboardShortcuts";
import { useBoardMediaController } from "./board/controllers/useBoardMediaController";
import { useBoardSelectionController } from "./board/controllers/useBoardSelectionController";
import { useBoardSolid3DController } from "./board/controllers/useBoardSolid3DController";
import { useCoordinatePlotController } from "./board/controllers/useCoordinatePlotController";
import { useLaserPointerController } from "./board/controllers/useLaserPointerController";
import type { AppPersistenceStatus, MathInkRecognizer } from "./board/types";
import { BoardCanvas } from "./board/views/BoardCanvas";
import { BoardDiagnostics } from "./board/views/BoardDiagnostics";
import { BoardNotifications } from "./board/views/BoardNotifications";
import { BoardOverlays } from "./board/views/BoardOverlays";
import { BoardSettingsPanel } from "./board/views/BoardSettingsPanel";
import { BoardShortcutsDialog } from "./board/views/BoardShortcutsDialog";
import { BoardToolDockContainer } from "./board/views/BoardToolDockContainer";
import { readEnvironment } from "./configuration/environment";
import "./styles.css";

export type { AppPersistenceStatus } from "./board/types";

const environment = readEnvironment();
const localActorId = actorId("actor:local-teacher");

interface AppBoardTransformSnapshot {
  readonly objectId: string;
  readonly position: Vec2;
  readonly rotation: number;
  readonly scale: Vec2;
}

export interface AppProps {
  readonly commandActorId?: ActorId;
  readonly geometryOsClient?: GeometryOsClient | undefined;
  readonly historyEnabled?: boolean;
  readonly mathInkRecognizer?: MathInkRecognizer | undefined;
  readonly initialDocument?: BoardDocument;
  readonly collaborativeUndoAvailable?: boolean;
  readonly onCollaborativeUndo?: () => void;
  readonly onCommandCommitted?:
    | ((
        command: BoardCommand,
        document: BoardDocument,
        previousDocument: BoardDocument,
      ) => void)
    | undefined;
  readonly onDocumentChange?: (document: BoardDocument) => void;
  readonly onExportDocument?: ((document: BoardDocument) => void) | undefined;
  readonly onExportPngSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportPdfSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportSvgSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportDiagnostics?: () => void;
  readonly onImportDocument?: (file: File) => void;
  readonly onShareBoard?: (() => void) | undefined;
  readonly onPresenceChange?: (presence: {
    readonly cursor?: { readonly x: number; readonly y: number };
    readonly selectedObjectIds: readonly string[];
    readonly viewport: {
      readonly x: number;
      readonly y: number;
      readonly zoom: number;
    };
  }) => void;
  readonly onInkPreviewChange?: (preview: {
    readonly phase: "cancel" | "end" | "start" | "update";
    readonly points?: readonly Vec2[];
    readonly previewId: string;
    readonly style?: {
      readonly opacity: number;
      readonly stroke: string;
      readonly strokeWidth: number;
    };
  }) => void;
  readonly onTransformPreviewChange?: (preview: {
    readonly phase: "end" | "update";
    readonly previewId: string;
    readonly transforms?: readonly AppBoardTransformSnapshot[];
  }) => void;
  readonly onRetryPersistence?: () => void;
  readonly persistenceNotice?: string | null;
  readonly persistenceStatus?: AppPersistenceStatus;
  readonly readOnly?: boolean;
  readonly settingsExtra?: ReactNode;
  readonly remoteCursors?: readonly {
    readonly actorId: string;
    readonly point: { readonly x: number; readonly y: number };
  }[];
  readonly remoteInkPreviews?: readonly {
    readonly actorId: string;
    readonly clientId: string;
    readonly displayName: string;
    readonly points: readonly Vec2[];
    readonly previewId: string;
    readonly style: {
      readonly opacity: number;
      readonly stroke: string;
      readonly strokeWidth: number;
    };
  }[];
  readonly remoteTransformPreviews?: readonly {
    readonly actorId: string;
    readonly clientId: string;
    readonly displayName: string;
    readonly previewId: string;
    readonly transforms: readonly {
      readonly objectId: string;
      readonly position: Vec2;
      readonly rotation: number;
      readonly scale: Vec2;
    }[];
  }[];
}

// The persistence bootstrap reuses this deterministic seed without importing UI state.
// eslint-disable-next-line react-refresh/only-export-components
export function createInitialDocument(): BoardDocument {
  const timestamp = new Date().toISOString();
  return createEmptyBoardDocument({
    id: documentId("document:local-board"),
    title: "TutorBoard canvas",
    createdAt: timestamp,
  });
}

export function App({
  commandActorId = localActorId,
  collaborativeUndoAvailable = false,
  geometryOsClient,
  historyEnabled = true,
  mathInkRecognizer,
  initialDocument,
  onCommandCommitted,
  onCollaborativeUndo,
  onDocumentChange,
  onExportDocument,
  onExportPngSnapshot,
  onExportPdfSnapshot,
  onExportSvgSnapshot,
  onExportDiagnostics,
  onImportDocument,
  onShareBoard,
  onInkPreviewChange,
  onPresenceChange,
  onTransformPreviewChange,
  onRetryPersistence,
  persistenceNotice = null,
  persistenceStatus = { kind: "idle", label: "Локальное сохранение" },
  readOnly = false,
  settingsExtra,
  remoteCursors = [],
  remoteInkPreviews = [],
  remoteTransformPreviews = [],
}: AppProps = {}) {
  const [localInitialDocument] = useState(
    () => initialDocument ?? createInitialDocument(),
  );
  const documentController = useBoardDocumentController({
    collaborativeUndoAvailable,
    commandActorId,
    historyEnabled,
    initialDocument: initialDocument ?? localInitialDocument,
    onCollaborativeUndo,
    onCommandCommitted,
    onDocumentChange,
    readOnly,
  });
  const { commitCommand, createCommandMetadata, document, getDocument } =
    documentController;

  const [activeTool, setActiveTool] = useState<ActiveToolId>(navigationToolId);
  const [selectionInspectorObjectId, setSelectionInspectorObjectId] =
    useState<BoardObjectId | null>(null);
  const [accessibilityNotice, setAccessibilityNotice] = useState<string | null>(
    null,
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null);
  const shortcutsDialogRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const lastPointerWorldRef = useRef<Vec2 | null>(null);
  const localInkPreviewRef = useRef<{
    readonly pointCount: number;
    readonly previewId: string;
  } | null>(null);
  const localTransformPreviewIdRef = useRef<string | null>(null);
  const onInkPreviewChangeRef = useRef(onInkPreviewChange);
  const onTransformPreviewChangeRef = useRef(onTransformPreviewChange);

  useEffect(() => {
    onInkPreviewChangeRef.current = onInkPreviewChange;
    onTransformPreviewChangeRef.current = onTransformPreviewChange;
  }, [onInkPreviewChange, onTransformPreviewChange]);

  const announce = useCallback((message: string) => {
    setAccessibilityNotice(message);
  }, []);

  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => shortcutsButtonRef.current?.focus());
    });
  }, []);

  const resolvePlacementCenter = useCallback((): Vec2 => {
    const current = getDocument();
    const workspace = workspaceRef.current?.getBoundingClientRect();
    return (
      lastPointerWorldRef.current ??
      screenToWorld(
        {
          x: Math.max(1, workspace?.width ?? window.innerWidth) / 2,
          y: Math.max(1, workspace?.height ?? window.innerHeight) / 2,
        },
        current.viewport,
      )
    );
  }, [getDocument]);

  const sceneSelector = useMemo(() => createBoardSceneSelector(), []);
  const scene = useMemo(
    () => sceneSelector(document),
    [document, sceneSelector],
  );

  const selection = useBoardSelectionController({
    announce,
    documentController,
    scene,
  });

  const handleTextInserted = useCallback(
    (objectId: BoardObjectId) => {
      selection.replaceSelection([objectId]);
      setSelectionInspectorObjectId(objectId);
      setActiveTool(selectionToolId);
    },
    [selection],
  );
  const drawing = useBoardDrawingController({
    announce,
    documentController,
    onTextInserted: handleTextInserted,
  });

  useEffect(() => {
    const current = drawing.state;
    const previous = localInkPreviewRef.current;
    if (current.kind !== "drawing-pen") {
      if (previous !== null) {
        onInkPreviewChangeRef.current?.({
          phase: "end",
          previewId: previous.previewId,
        });
        localInkPreviewRef.current = null;
      }
      return;
    }
    const previewId = current.objectId;
    const points = current.samples.map(({ point }) => point);
    if (previous === null || previous.previewId !== previewId) {
      if (previous !== null) {
        onInkPreviewChangeRef.current?.({
          phase: "cancel",
          previewId: previous.previewId,
        });
      }
      onInkPreviewChangeRef.current?.({
        phase: "start",
        points: points.slice(-64),
        previewId,
        style: {
          opacity: current.style.opacity,
          stroke: current.style.stroke ?? "#202020",
          strokeWidth: current.style.strokeWidth,
        },
      });
    } else if (points.length > previous.pointCount) {
      onInkPreviewChangeRef.current?.({
        phase: "update",
        points: points.slice(previous.pointCount),
        previewId,
      });
    }
    localInkPreviewRef.current = {
      pointCount: points.length,
      previewId,
    };
  }, [drawing.state]);

  useEffect(
    () => () => {
      const ink = localInkPreviewRef.current;
      if (ink !== null) {
        onInkPreviewChangeRef.current?.({
          phase: "cancel",
          previewId: ink.previewId,
        });
      }
      const transformId = localTransformPreviewIdRef.current;
      if (transformId !== null) {
        onTransformPreviewChangeRef.current?.({
          phase: "end",
          previewId: transformId,
        });
      }
    },
    [],
  );

  const publishTransformPreview = useCallback(
    (transforms: readonly AppBoardTransformSnapshot[] | null) => {
      if (transforms !== null && transforms.length > 0) {
        const previewId =
          localTransformPreviewIdRef.current ??
          `transform:${crypto.randomUUID()}`;
        localTransformPreviewIdRef.current = previewId;
        onTransformPreviewChangeRef.current?.({
          phase: "update",
          previewId,
          transforms,
        });
        return;
      }
      const previewId = localTransformPreviewIdRef.current;
      if (previewId !== null) {
        onTransformPreviewChangeRef.current?.({ phase: "end", previewId });
        localTransformPreviewIdRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const delta = selection.previewDelta;
    if (delta === null) {
      publishTransformPreview(null);
      return;
    }
    publishTransformPreview(
      selection.state.selectedObjectIds.flatMap((objectId) => {
        const object = document.objects[objectId];
        if (object === undefined) return [];
        return [
          {
            objectId,
            position: {
              x: object.position.x + delta.x,
              y: object.position.y + delta.y,
            },
            rotation: object.rotation,
            scale: object.scale,
          },
        ];
      }),
    );
  }, [
    document.objects,
    publishTransformPreview,
    selection.previewDelta,
    selection.state.selectedObjectIds,
  ]);

  const handleObjectsInserted = useCallback(
    (objectIds: readonly BoardObjectId[]) => {
      selection.replaceSelection(objectIds);
      setActiveTool(selectionToolId);
    },
    [selection],
  );
  const clipboard = useBoardClipboardController({
    actorId: commandActorId,
    documentController,
    onPasted: handleObjectsInserted,
    selection,
  });
  const media = useBoardMediaController({
    clipboard,
    documentController,
    onImagesInserted: handleObjectsInserted,
    resolvePlacementCenter,
  });

  const handleGeometrySelectionCreated = useCallback(
    (
      objectIds: readonly BoardObjectId[],
      inspectorId: BoardObjectId | null,
    ) => {
      selection.replaceSelection(objectIds);
      setSelectionInspectorObjectId(inspectorId);
      setActiveTool(selectionToolId);
    },
    [selection],
  );
  const geometry = useBoardGeometryController({
    actorId: commandActorId,
    announce,
    client: geometryOsClient,
    documentController,
    onArmPlacement: () => setActiveTool(geometryPlacementToolId),
    onInspectObject: setSelectionInspectorObjectId,
    onPlacementFinished: () => undefined,
    onRemotePlacementStarted: () => setActiveTool(navigationToolId),
    onSelectionCreated: handleGeometrySelectionCreated,
    selection,
  });

  const solid3D = useBoardSolid3DController({
    announce,
    documentController,
    enabled: environment.features.solid3D,
    selection,
  });

  const handleHandwritingPlotBuilt = useCallback(
    (objectId: BoardObjectId) => {
      selection.replaceSelection([objectId]);
      setSelectionInspectorObjectId(null);
      setActiveTool(selectionToolId);
    },
    [selection],
  );
  const handwriting = useBoardHandwritingController({
    announce,
    documentController,
    onPlotBuilt: handleHandwritingPlotBuilt,
    recognizer: mathInkRecognizer,
  });

  const selectCoordinatePlot = useCallback(
    (objectId: BoardObjectId) => {
      selection.replaceSelection([objectId]);
      setSelectionInspectorObjectId(null);
      setActiveTool(selectionToolId);
    },
    [selection],
  );
  const plots = useCoordinatePlotController({
    announce,
    documentController,
    onSelectPlot: selectCoordinatePlot,
    readOnly,
    resolvePlacementCenter,
  });

  const laser = useLaserPointerController();
  const interaction = useBoardInteractionRouter({
    activeTool,
    documentController,
    drawing,
    geometry,
    handwriting,
    laser,
    onInspectorClose: () => setSelectionInspectorObjectId(null),
    scene,
    selection,
    setActiveTool,
  });

  const selectionInspectorOpen =
    plots.editor === null &&
    selectionInspectorObjectId !== null &&
    Object.hasOwn(document.objects, selectionInspectorObjectId) &&
    selection.state.selectedObjectIds.includes(selectionInspectorObjectId);

  useEffect(() => {
    onPresenceChange?.({
      selectedObjectIds: selection.state.selectedObjectIds,
      viewport: {
        x: document.viewport.offset.x,
        y: document.viewport.offset.y,
        zoom: document.viewport.zoom,
      },
    });
  }, [
    document.viewport.offset.x,
    document.viewport.offset.y,
    document.viewport.zoom,
    onPresenceChange,
    selection.state.selectedObjectIds,
  ]);

  useBoardKeyboardShortcuts({
    activeTool,
    clipboard,
    closeGeometry: () => geometry.setOpen(false),
    closeInspector: () => setSelectionInspectorObjectId(null),
    closeSettings: () => setSettingsOpen(false),
    closeShortcuts,
    documentController,
    geometryOpen: geometry.open,
    handwriting,
    handwrittenFunctionsEnabled: environment.features.handwrittenFunctions,
    interaction,
    openShortcuts: () => setShortcutsOpen(true),
    plots,
    readOnly,
    selection,
    selectionInspectorOpen,
    settingsOpen,
    shortcutsOpen,
  });

  const commitViewport = useCallback(
    (viewport: ViewportState) => {
      commitCommand({
        ...createCommandMetadata(),
        kind: "core.viewport.set",
        viewport,
      });
    },
    [commitCommand, createCommandMetadata],
  );

  const resetViewport = useCallback(() => {
    commitViewport({ offset: { x: 160, y: 90 }, zoom: 1 });
  }, [commitViewport]);

  const handlePointerHover = useCallback(
    (cursor: Vec2) => {
      lastPointerWorldRef.current = cursor;
      const current = getDocument();
      onPresenceChange?.({
        cursor,
        selectedObjectIds: selection.getState().selectedObjectIds,
        viewport: {
          x: current.viewport.offset.x,
          y: current.viewport.offset.y,
          zoom: current.viewport.zoom,
        },
      });
    },
    [getDocument, onPresenceChange, selection],
  );

  const requestObjectSettings = useCallback(
    (objectId: BoardObjectId) => {
      const object = getDocument().objects[objectId];
      if (object === undefined) return;
      if (object.kind === "math.coordinate-plot") {
        setSelectionInspectorObjectId(null);
        plots.beginEditing(objectId);
        return;
      }
      interaction.activate(selectionToolId);
      selection.ensureObjectSelected(objectId);
      plots.close();
      setSelectionInspectorObjectId(objectId);
      geometry.inspectObjectVertex(objectId);
      announce("Настройки объекта открыты");
    },
    [announce, geometry, getDocument, interaction, plots, selection],
  );

  return (
    <main className="board-app board-app--minimal">
      <h1 className="visually-hidden">TutorBoard</h1>
      <section
        aria-label="Рабочая область доски"
        className="workspace board-workspace--minimal"
        ref={workspaceRef}
        tabIndex={-1}
      >
        <BoardNotifications
          accessibilityNotice={accessibilityNotice}
          clipboardNotice={clipboard.notice}
          mediaDiagnostic={media.diagnostic}
          onRetryPersistence={onRetryPersistence}
          persistenceNotice={persistenceNotice}
          persistenceStatus={persistenceStatus}
          smartInkNotice={drawing.smartInkNotice}
        />
        <BoardCanvas
          activeTool={activeTool}
          announce={announce}
          clipboard={clipboard}
          document={document}
          drawing={drawing}
          handwriting={handwriting}
          interaction={interaction}
          laser={laser}
          onInspectorClose={() => setSelectionInspectorObjectId(null)}
          onObjectSettingsRequest={requestObjectSettings}
          onPointerHover={handlePointerHover}
          onTransformPreviewChange={publishTransformPreview}
          onViewportCommit={commitViewport}
          plots={plots}
          readOnly={readOnly}
          remoteCursors={remoteCursors}
          remoteInkPreviews={remoteInkPreviews}
          remoteTransformPreviews={remoteTransformPreviews}
          scene={scene}
          selection={selection}
          solid3D={solid3D}
        />
        <BoardOverlays
          activeTool={activeTool}
          geometry={geometry}
          handwriting={handwriting}
          handwrittenFunctionsEnabled={
            environment.features.handwrittenFunctions
          }
          interaction={interaction}
          plots={plots}
          readOnly={readOnly}
          solid3D={solid3D}
          solid3DLearningEnabled={environment.features.solid3DLearning}
          undo={documentController.undo}
          workspaceRef={workspaceRef}
        />
        <BoardToolDockContainer
          activeTool={activeTool}
          collaborativeUndoAvailable={collaborativeUndoAvailable}
          documentController={documentController}
          drawing={drawing}
          geometry={geometry}
          handwrittenFunctionsEnabled={
            environment.features.handwrittenFunctions
          }
          historyEnabled={historyEnabled}
          interaction={interaction}
          media={media}
          onCreatePlot={plots.create}
          onOpenSettings={() => {
            geometry.setOpen(false);
            setSettingsOpen(true);
          }}
          plotEditorOpen={plots.editor !== null}
          readOnly={readOnly}
          selection={selection}
          selectionInspectorOpen={selectionInspectorOpen}
          settingsOpen={settingsOpen}
          solid3D={solid3D}
        />
        <BoardSettingsPanel
          clipboard={clipboard}
          developmentDiagnostics={environment.features.developmentDiagnostics}
          document={document}
          interaction={interaction}
          onClose={() => {
            if (!shortcutsOpen) setSettingsOpen(false);
          }}
          onExportDiagnostics={onExportDiagnostics}
          onExportDocument={onExportDocument}
          onExportPdfSnapshot={onExportPdfSnapshot}
          onExportPngSnapshot={onExportPngSnapshot}
          onExportSvgSnapshot={onExportSvgSnapshot}
          onImportDocument={onImportDocument}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onResetViewport={resetViewport}
          onShareBoard={onShareBoard}
          open={settingsOpen}
          persistenceStatus={persistenceStatus}
          selection={selection}
          settingsExtra={settingsExtra}
          shortcutsButtonRef={shortcutsButtonRef}
          shortcutsOpen={shortcutsOpen}
          stage={environment.stage}
        />
        {shortcutsOpen ? (
          <BoardShortcutsDialog
            dialogRef={shortcutsDialogRef}
            onClose={closeShortcuts}
          />
        ) : null}
        <BoardDiagnostics
          document={document}
          documentController={documentController}
          drawing={drawing}
          firstObject={scene.items[0]?.object}
          persistenceLabel={persistenceStatus.label}
          selection={selection}
        />
      </section>
    </main>
  );
}
