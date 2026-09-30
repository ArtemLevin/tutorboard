import { useCallback, useMemo, useRef, useState } from "react";

import {
  boardObjectId,
  type BoardDocument,
  type BoardObjectId,
  type BoardRenderItem,
  type BoardSceneReadModel,
  type PenStrokeObject,
  type Vec2,
} from "../../../core/public";
import {
  createEraserRewriteCommand,
  eraseBoardSceneObjects,
  type EraserResult,
} from "../../../modules/eraser/public";
import { useEraserPreferences } from "../../board-chrome/eraser-preferences";
import type { BoardDocumentController } from "./useBoardDocumentController";

interface EraserPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
}

interface EraserSession {
  readonly baseDocument: BoardDocument;
  readonly baseItems: readonly BoardRenderItem[];
  readonly fragmentIds: Map<string, BoardObjectId>;
  readonly path: Vec2[];
  readonly pointerId: number;
  readonly radiusWorld: number;
}

const maximumGesturePoints = 4096;

function appendPoint(path: Vec2[], point: Vec2): void {
  if (path.length >= maximumGesturePoints) {
    path[path.length - 1] = point;
    return;
  }
  const previous = path.at(-1);
  if (
    previous === undefined ||
    Math.hypot(point.x - previous.x, point.y - previous.y) > 0.25
  ) {
    path.push(point);
  }
}

function fragmentId(
  session: EraserSession,
  original: PenStrokeObject,
  fragmentIndex: number,
): BoardObjectId {
  if (fragmentIndex === 0) return original.id;
  const key = `${original.id}:${fragmentIndex}`;
  const existing = session.fragmentIds.get(key);
  if (existing !== undefined) return existing;
  const created = boardObjectId(`object:${crypto.randomUUID()}`);
  session.fragmentIds.set(key, created);
  return created;
}

function calculatePreview(session: EraserSession): EraserResult {
  return eraseBoardSceneObjects(
    session.baseDocument,
    session.baseItems,
    session.path,
    session.radiusWorld,
    (original, index) => fragmentId(session, original, index),
  );
}

export interface UseBoardEraserControllerOptions {
  readonly announce: (message: string) => void;
  readonly documentController: BoardDocumentController;
  readonly scene: BoardSceneReadModel;
}

export function useBoardEraserController({
  announce,
  documentController,
  scene,
}: UseBoardEraserControllerOptions) {
  const commitCommand = documentController.commitCommand;
  const createCommandMetadata = documentController.createCommandMetadata;
  const getDocument = documentController.getDocument;
  const sessionRef = useRef<EraserSession | null>(null);
  const [point, setPoint] = useState<Vec2 | null>(null);
  const [preview, setPreview] = useState<EraserResult | null>(null);
  const { diameterPx, setDiameterPx } = useEraserPreferences();

  const previewItems = useMemo(
    () =>
      (preview?.changes ?? []).flatMap(({ replacements }) =>
        replacements.map(
          (object) =>
            ({
              object,
              transforms: [],
            }) satisfies BoardRenderItem,
        ),
      ),
    [preview],
  );
  const suppressedObjectIds = useMemo(
    () => (preview?.changes ?? []).map(({ original }) => original.id),
    [preview],
  );

  const updatePreview = useCallback((session: EraserSession) => {
    setPreview(calculatePreview(session));
  }, []);

  const hover = useCallback((nextPoint: Vec2 | null) => {
    setPoint(nextPoint);
  }, []);

  const start = useCallback(
    (sample: EraserPointerSample) => {
      const current = getDocument();
      const session: EraserSession = {
        baseDocument: current,
        baseItems: scene.items,
        fragmentIds: new Map(),
        path: [sample.point],
        pointerId: sample.pointerId,
        radiusWorld: diameterPx / 2 / current.viewport.zoom,
      };
      sessionRef.current = session;
      setPoint(sample.point);
      updatePreview(session);
    },
    [diameterPx, getDocument, scene.items, updatePreview],
  );

  const move = useCallback(
    (sample: EraserPointerSample) => {
      const session = sessionRef.current;
      if (session === null || session.pointerId !== sample.pointerId) return;
      appendPoint(session.path, sample.point);
      setPoint(sample.point);
      updatePreview(session);
    },
    [updatePreview],
  );

  const moveBatch = useCallback(
    (samples: readonly EraserPointerSample[]) => {
      if (samples.length === 0) return;
      const session = sessionRef.current;
      if (session === null) return;
      let changed = false;
      for (const sample of samples) {
        if (sample.pointerId === session.pointerId) {
          const before = session.path.length;
          appendPoint(session.path, sample.point);
          changed = changed || session.path.length !== before;
        }
      }
      const last = [...samples]
        .reverse()
        .find(({ pointerId }) => pointerId === session.pointerId);
      if (last !== undefined) setPoint(last.point);
      if (changed) updatePreview(session);
    },
    [updatePreview],
  );

  const finish = useCallback(
    (sample: EraserPointerSample) => {
      const session = sessionRef.current;
      if (session === null || session.pointerId !== sample.pointerId) return;
      appendPoint(session.path, sample.point);
      sessionRef.current = null;
      setPoint(sample.point);

      const result = calculatePreview(session);
      setPreview(null);
      if (result.changes.length === 0) return;
      const committed = commitCommand(
        createEraserRewriteCommand(
          createCommandMetadata(),
          result.changes.map(({ original, replacements }) => ({
            original,
            replacements,
          })),
        ),
      );
      if (committed.ok) {
        announce(`Ластик: изменено объектов ${result.changes.length}`);
      } else {
        announce("Ластик: доска изменилась, повторите жест.");
      }
    },
    [announce, commitCommand, createCommandMetadata],
  );

  const cancel = useCallback((pointerId?: number) => {
    const session = sessionRef.current;
    if (
      session === null ||
      (pointerId !== undefined && session.pointerId !== pointerId)
    ) {
      return;
    }
    sessionRef.current = null;
    setPreview(null);
  }, []);

  const clear = useCallback(() => {
    sessionRef.current = null;
    setPoint(null);
    setPreview(null);
  }, []);

  return {
    cancel,
    clear,
    diameterPx,
    finish,
    hover,
    move,
    moveBatch,
    point,
    previewItems,
    radiusPx: diameterPx / 2,
    setDiameterPx,
    start,
    suppressedObjectIds,
  } as const;
}

export type BoardEraserController = ReturnType<typeof useBoardEraserController>;
