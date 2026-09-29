import { useCallback, useRef, useState } from "react";

import { boardObjectId, type Vec2 } from "../../../core/public";
import {
  createEraserCommand,
  eraseDocumentPenStrokes,
  eraserRadiusPx,
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
}

export function useBoardEraserController({
  announce,
  documentController,
}: UseBoardEraserControllerOptions) {
  const { commitCommands, createCommandMetadata, getDocument } =
    documentController;
  const sessionRef = useRef<EraserSession | null>(null);
  const [point, setPoint] = useState<Vec2 | null>(null);

  const hover = useCallback((nextPoint: Vec2 | null) => {
    setPoint(nextPoint);
  }, []);

  const start = useCallback((sample: EraserPointerSample) => {
    sessionRef.current = {
      path: [sample.point],
      pointerId: sample.pointerId,
    };
    setPoint(sample.point);
  }, []);

  const move = useCallback((sample: EraserPointerSample) => {
    const session = sessionRef.current;
    if (session === null || session.pointerId !== sample.pointerId) return;
    appendPoint(session.path, sample.point);
    setPoint(sample.point);
  }, []);

  const moveBatch = useCallback((samples: readonly EraserPointerSample[]) => {
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
    }
  }, []);

  const finish = useCallback(
    (sample: EraserPointerSample) => {
      const session = sessionRef.current;
      if (session === null || session.pointerId !== sample.pointerId) return;
      appendPoint(session.path, sample.point);
      sessionRef.current = null;
      setPoint(sample.point);

      const current = getDocument();
      const objects = current.order.flatMap((id) => {
        const object = current.objects[id];
        return object === undefined ? [] : [object];
      });
      const result = eraseDocumentPenStrokes(
        objects,
        session.path,
        eraserRadiusPx / current.viewport.zoom,
        (original, fragmentIndex) =>
          fragmentIndex === 0
            ? original.id
            : boardObjectId(`object:${crypto.randomUUID()}`),
      );
      if (result.originals.length === 0) return;

      const committed = commitCommands(
        result.changes.map(({ original, replacements }) =>
          createEraserCommand(
            createCommandMetadata(),
            [original],
            replacements,
          ),
        ),
      );
      if (committed.ok) {
        announce(
          result.replacements.length === 0
            ? `Ластик: удалено штрихов ${result.originals.length}`
            : `Ластик: изменено штрихов ${result.originals.length}`,
        );
      }
    },
    [announce, commitCommands, createCommandMetadata, getDocument],
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
  }, []);

  const clear = useCallback(() => {
    sessionRef.current = null;
    setPoint(null);
  }, []);

  return {
    cancel,
    clear,
    finish,
    hover,
    move,
    moveBatch,
    point,
    radiusPx: eraserRadiusPx,
    start,
  } as const;
}

export type BoardEraserController = ReturnType<
  typeof useBoardEraserController
>;
