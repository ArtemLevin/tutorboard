import { useCallback, useRef, useState } from "react";

import {
  boardObjectId,
  type BoardObjectId,
  type BoardSceneReadModel,
  type PenStrokeObject,
  type Vec2,
} from "../../../core/public";
import {
  createBatchEraserCommand,
  createDeleteEraserCommand,
  eraseDocumentObjects,
  readEraserDiameterPx,
  writeEraserDiameterPx,
} from "../../../modules/eraser/public";
import type { BoardDocumentController } from "./useBoardDocumentController";

interface EraserPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
}

interface EraserSession {
  readonly pointerId: number;
  readonly path: Vec2[];
}

export interface EraserPreview {
  readonly replacements: readonly PenStrokeObject[];
  readonly suppressedObjectIds: readonly BoardObjectId[];
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
  const commitCommands = documentController.commitCommands;
  const createCommandMetadata = documentController.createCommandMetadata;
  const getDocument = documentController.getDocument;
  const sessionRef = useRef<EraserSession | null>(null);
  const [point, setPoint] = useState<Vec2 | null>(null);
  const [diameterPx, setDiameterPxState] = useState(readEraserDiameterPx);
  const [preview, setPreview] = useState<EraserPreview | null>(null);

  const previewForPath = useCallback(
    (path: readonly Vec2[]): EraserPreview => {
      const current = getDocument();
      const result = eraseDocumentObjects(
        current,
        scene,
        path,
        diameterPx / 2 / current.viewport.zoom,
        (original, fragmentIndex) =>
          fragmentIndex === 0
            ? original.id
            : boardObjectId(
                `preview:eraser:${original.id}:${fragmentIndex}`,
              ),
      );
      return {
        replacements: result.replacements,
        suppressedObjectIds: result.suppressedObjectIds,
      };
    },
    [diameterPx, getDocument, scene],
  );

  const updatePreview = useCallback(
    (path: readonly Vec2[]) => {
      const next = previewForPath(path);
      setPreview(
        next.suppressedObjectIds.length === 0 ? null : next,
      );
    },
    [previewForPath],
  );

  const hover = useCallback((nextPoint: Vec2 | null) => {
    setPoint(nextPoint);
  }, []);

  const start = useCallback(
    (sample: EraserPointerSample) => {
      sessionRef.current = {
        path: [sample.point],
        pointerId: sample.pointerId,
      };
      setPoint(sample.point);
      updatePreview([sample.point]);
    },
    [updatePreview],
  );

  const move = useCallback(
    (sample: EraserPointerSample) => {
      const session = sessionRef.current;
      if (session === null || session.pointerId !== sample.pointerId) return;
      appendPoint(session.path, sample.point);
      setPoint(sample.point);
      updatePreview(session.path);
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
          changed ||= session.path.length !== before;
        }
      }
      const last = samples.at(-1);
      if (last !== undefined && last.pointerId === session.pointerId) {
        setPoint(last.point);
      }
      if (changed) updatePreview(session.path);
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
      setPreview(null);

      const current = getDocument();
      const result = eraseDocumentObjects(
        current,
        scene,
        session.path,
        diameterPx / 2 / current.viewport.zoom,
        (original, fragmentIndex) =>
          fragmentIndex === 0
            ? original.id
            : boardObjectId(`object:${crypto.randomUUID()}`),
      );
      if (result.suppressedObjectIds.length === 0) return;

      const commands = [
        createBatchEraserCommand(
          createCommandMetadata(),
          current,
          result.changes,
        ),
        createDeleteEraserCommand(
          createCommandMetadata(),
          result.deletedObjectIds,
        ),
      ].filter((command) => command !== null);
      const committed = commitCommands(commands);
      if (committed.ok) {
        announce(
          `Ластик: изменено объектов ${result.suppressedObjectIds.length}`,
        );
      }
    },
    [
      announce,
      commitCommands,
      createCommandMetadata,
      diameterPx,
      getDocument,
      scene,
    ],
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

  const setDiameterPx = useCallback((value: number) => {
    setDiameterPxState(writeEraserDiameterPx(value));
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
    preview,
    radiusPx: diameterPx / 2,
    setDiameterPx,
    start,
  } as const;
}

export type BoardEraserController = ReturnType<typeof useBoardEraserController>;
