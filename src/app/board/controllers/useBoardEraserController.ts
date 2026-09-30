import { useCallback, useEffect, useRef, useState } from "react";

import {
  boardObjectId,
  type BoardObject,
  type BoardObjectId,
  type BoardSceneReadModel,
  type Vec2,
} from "../../../core/public";
import { createEraserCommand, planEraserChanges } from "../../../modules/eraser/public";
import { selectObjectIdsNearPath } from "../../../modules/selection/public";
import type { BoardDocumentController } from "./useBoardDocumentController";

interface EraserPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
}

interface EraserSession {
  readonly path: Vec2[];
  readonly pointerId: number;
  readonly touchedObjectIds: Set<BoardObjectId>;
}

export interface EraserPreview {
  readonly replacements: readonly BoardObject[];
  readonly suppressedObjectIds: readonly BoardObjectId[];
}

const maximumGesturePoints = 4096;
const defaultEraserDiameterPx = 24;
const minimumEraserDiameterPx = 8;
const maximumEraserDiameterPx = 96;
const eraserPreferenceKey = "tutorboard.eraser-preferences/1";

function readEraserDiameter(): number {
  try {
    const value = Number(window.localStorage.getItem(eraserPreferenceKey));
    return Number.isFinite(value)
      ? Math.min(
          maximumEraserDiameterPx,
          Math.max(minimumEraserDiameterPx, value),
        )
      : defaultEraserDiameterPx;
  } catch {
    return defaultEraserDiameterPx;
  }
}

function appendPoint(path: Vec2[], point: Vec2): boolean {
  if (path.length >= maximumGesturePoints) {
    path[path.length - 1] = point;
    return true;
  }
  const previous = path.at(-1);
  if (
    previous === undefined ||
    Math.hypot(point.x - previous.x, point.y - previous.y) > 0.25
  ) {
    path.push(point);
    return true;
  }
  return false;
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
  const [diameterPx, setDiameterPxState] = useState(readEraserDiameter);
  const [preview, setPreview] = useState<EraserPreview | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const pendingPreviewSessionRef = useRef<EraserSession | null>(null);

  const radiusWorld = useCallback(
    (zoom: number) => diameterPx / 2 / zoom,
    [diameterPx],
  );

  const collectTouched = useCallback(
    (session: EraserSession, brushPath: readonly Vec2[]) => {
      const current = getDocument();
      const radius = radiusWorld(current.viewport.zoom);
      for (const objectId of selectObjectIdsNearPath(scene, brushPath, radius)) {
        session.touchedObjectIds.add(objectId);
      }
    },
    [getDocument, radiusWorld, scene],
  );

  const buildPlan = useCallback(
    (session: EraserSession, previewIds: boolean) => {
      const current = getDocument();
      const radius = radiusWorld(current.viewport.zoom);
      const objects = current.order.flatMap((id) => {
        if (!session.touchedObjectIds.has(id)) return [];
        const object = current.objects[id];
        return object === undefined ? [] : [object];
      });
      let sequence = 0;
      return planEraserChanges(
        objects,
        [...session.touchedObjectIds],
        session.path,
        radius,
        (original, fragmentIndex) =>
          fragmentIndex === 0
            ? original.id
            : boardObjectId(
                previewIds
                  ? `preview:eraser:${original.id}:${fragmentIndex}`
                  : `object:${crypto.randomUUID()}:${sequence++}`,
              ),
      );
    },
    [getDocument, radiusWorld],
  );

  const updatePreview = useCallback(
    (session: EraserSession) => {
      pendingPreviewSessionRef.current = session;
      if (previewFrameRef.current !== null) return;
      previewFrameRef.current = window.requestAnimationFrame(() => {
        previewFrameRef.current = null;
        const pendingSession = pendingPreviewSessionRef.current;
        pendingPreviewSessionRef.current = null;
        if (pendingSession === null) return;
        const plan = buildPlan(pendingSession, true);
        setPreview({
          replacements: plan.replacements,
          suppressedObjectIds: [
            ...plan.originals.map(({ id }) => id),
            ...plan.groupedObjectIds,
          ],
        });
      });
    },
    [buildPlan],
  );

  const clearPreviewSchedule = useCallback(() => {
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    pendingPreviewSessionRef.current = null;
  }, []);

  useEffect(
    () => () => {
      clearPreviewSchedule();
    },
    [clearPreviewSchedule],
  );

  const setDiameterPx = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const normalized = Math.min(
      maximumEraserDiameterPx,
      Math.max(minimumEraserDiameterPx, value),
    );
    setDiameterPxState(normalized);
    try {
      window.localStorage.setItem(eraserPreferenceKey, String(normalized));
    } catch {
      // Browser storage is optional; the runtime setting still applies.
    }
  }, []);

  const hover = useCallback((nextPoint: Vec2 | null) => {
    setPoint(nextPoint);
  }, []);

  const start = useCallback(
    (sample: EraserPointerSample) => {
      const session: EraserSession = {
        path: [sample.point],
        pointerId: sample.pointerId,
        touchedObjectIds: new Set(),
      };
      sessionRef.current = session;
      collectTouched(session, [sample.point]);
      setPoint(sample.point);
      updatePreview(session);
    },
    [collectTouched, updatePreview],
  );

  const move = useCallback(
    (sample: EraserPointerSample) => {
      const session = sessionRef.current;
      if (session === null || session.pointerId !== sample.pointerId) return;
      const previous = session.path.at(-1);
      if (appendPoint(session.path, sample.point)) {
        collectTouched(
          session,
          previous === undefined ? [sample.point] : [previous, sample.point],
        );
      }
      setPoint(sample.point);
      updatePreview(session);
    },
    [collectTouched, updatePreview],
  );

  const moveBatch = useCallback(
    (samples: readonly EraserPointerSample[]) => {
      if (samples.length === 0) return;
      const session = sessionRef.current;
      if (session === null) return;
      const brushPath: Vec2[] = [];
      let previous = session.path.at(-1);
      for (const sample of samples) {
        if (
          sample.pointerId === session.pointerId &&
          appendPoint(session.path, sample.point)
        ) {
          if (brushPath.length === 0 && previous !== undefined) {
            brushPath.push(previous);
          }
          brushPath.push(sample.point);
          previous = sample.point;
        }
      }
      const last = samples.at(-1);
      if (last !== undefined && last.pointerId === session.pointerId) {
        if (brushPath.length > 0) collectTouched(session, brushPath);
        setPoint(last.point);
        updatePreview(session);
      }
    },
    [collectTouched, updatePreview],
  );

  const finish = useCallback(
    (sample: EraserPointerSample) => {
      const session = sessionRef.current;
      if (session === null || session.pointerId !== sample.pointerId) return;
      const previous = session.path.at(-1);
      if (appendPoint(session.path, sample.point)) {
        collectTouched(
          session,
          previous === undefined ? [sample.point] : [previous, sample.point],
        );
      }
      sessionRef.current = null;
      setPoint(sample.point);

      clearPreviewSchedule();
      const plan = buildPlan(session, false);
      setPreview(null);
      const commands = [];
      if (plan.originals.length > 0) {
        commands.push(
          createEraserCommand(
            createCommandMetadata(),
            plan.originals,
            plan.replacements,
          ),
        );
      }
      if (plan.groupedObjectIds.length > 0) {
        commands.push({
          ...createCommandMetadata(),
          kind: "core.objects.delete" as const,
          objectIds: plan.groupedObjectIds,
        });
      }
      if (commands.length === 0) return;

      const committed = commitCommands(commands);
      if (committed.ok) {
        announce(
          `Ластик: изменено объектов ${plan.originals.length + plan.groupedObjectIds.length}`,
        );
      }
    },
    [
      announce,
      buildPlan,
      clearPreviewSchedule,
      collectTouched,
      commitCommands,
      createCommandMetadata,
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
    clearPreviewSchedule();
    setPreview(null);
  }, [clearPreviewSchedule]);

  const clear = useCallback(() => {
    sessionRef.current = null;
    clearPreviewSchedule();
    setPoint(null);
    setPreview(null);
  }, [clearPreviewSchedule]);

  return {
    cancel,
    clear,
    finish,
    hover,
    move,
    moveBatch,
    diameterPx,
    point,
    preview,
    radiusPx: diameterPx / 2,
    setDiameterPx,
    start,
  } as const;
}

export type BoardEraserController = ReturnType<typeof useBoardEraserController>;
