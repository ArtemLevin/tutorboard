import { useCallback, useRef, useState } from "react";

import {
  boardObjectId,
  type BoardObject,
  type BoardObjectId,
  type BoardSceneReadModel,
  type Vec2,
} from "../../../core/public";
import {
  createEraserCommand,
  planEraserChanges,
} from "../../../modules/eraser/public";
import { selectObjectIdsNearPath } from "../../../modules/selection/public";
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
  const [diameterPx, setDiameterPxState] = useState(readEraserDiameter);
  const [preview, setPreview] = useState<EraserPreview | null>(null);

  const radiusWorld = useCallback(
    (zoom: number) => diameterPx / 2 / zoom,
    [diameterPx],
  );

  const buildPlan = useCallback(
    (path: readonly Vec2[], previewIds: boolean) => {
      const current = getDocument();
      const radius = radiusWorld(current.viewport.zoom);
      const touchedObjectIds = selectObjectIdsNearPath(scene, path, radius);
      let sequence = 0;
      return planEraserChanges(
        current.order.flatMap((id) => {
          const object = current.objects[id];
          return object === undefined ? [] : [object];
        }),
        touchedObjectIds,
        path,
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
    [getDocument, radiusWorld, scene],
  );

  const updatePreview = useCallback(
    (path: readonly Vec2[]) => {
      const plan = buildPlan(path, true);
      setPreview({
        replacements: plan.replacements,
        suppressedObjectIds: [
          ...plan.originals.map(({ id }) => id),
          ...plan.groupedObjectIds,
        ],
      });
    },
    [buildPlan],
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
      for (const sample of samples) {
        if (sample.pointerId === session.pointerId) {
          appendPoint(session.path, sample.point);
        }
      }
      const last = samples.at(-1);
      if (last !== undefined && last.pointerId === session.pointerId) {
        setPoint(last.point);
        updatePreview(session.path);
      }
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

      const plan = buildPlan(session.path, false);
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
    [announce, buildPlan, commitCommands, createCommandMetadata],
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
