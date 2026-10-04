import { useCallback, useRef, useState } from "react";

import {
  boardObjectId,
  type BoardObject,
  type BoardObjectId,
  type Vec2,
} from "../../../core/public";
import {
  createBatchEraserCommand,
  normalizeEraserDiameterPx,
  readEraserDiameterPx,
  writeEraserDiameterPx,
} from "../../../modules/eraser/public";
import {
  advanceEraserGesture,
  createEraserGestureSession,
  reconcileEraserGesture,
  type EraserGestureSession,
} from "./eraser-session";
import type { BoardDocumentController } from "./useBoardDocumentController";

interface EraserPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
}

export interface EraserPreview {
  readonly hiddenObjectIds: readonly BoardObjectId[];
  readonly replacementObjects: readonly BoardObject[];
}

export interface UseBoardEraserControllerOptions {
  readonly announce: (message: string) => void;
  readonly documentController: BoardDocumentController;
}

export function useBoardEraserController({
  announce,
  documentController,
}: UseBoardEraserControllerOptions) {
  const commitCommands = documentController.commitCommands;
  const createCommandMetadata = documentController.createCommandMetadata;
  const getDocument = documentController.getDocument;
  const sessionRef = useRef<EraserGestureSession | null>(null);
  const [point, setPoint] = useState<Vec2 | null>(null);
  const [preview, setPreview] = useState<EraserPreview | null>(null);
  const [diameterPx, setDiameterPxState] = useState(readEraserDiameterPx);

  const createFragmentId = useCallback(
    () => boardObjectId(`object:${crypto.randomUUID()}`),
    [],
  );

  const updatePreview = useCallback(
    (session: EraserGestureSession, points: readonly Vec2[]) => {
      setPreview(advanceEraserGesture(session, points, createFragmentId));
    },
    [createFragmentId],
  );

  const setDiameterPx = useCallback((value: number) => {
    const normalized = normalizeEraserDiameterPx(value);
    setDiameterPxState(normalized);
    writeEraserDiameterPx(normalized);
  }, []);

  const hover = useCallback((nextPoint: Vec2 | null) => {
    setPoint(nextPoint);
  }, []);

  const start = useCallback(
    (sample: EraserPointerSample) => {
      const document = getDocument();
      const radiusWorld = diameterPx / 2 / document.viewport.zoom;
      const session = createEraserGestureSession(
        document,
        sample.pointerId,
        radiusWorld,
      );
      sessionRef.current = session;
      setPoint(sample.point);
      updatePreview(session, [sample.point]);
    },
    [diameterPx, getDocument, updatePreview],
  );

  const move = useCallback(
    (sample: EraserPointerSample) => {
      const session = sessionRef.current;
      if (session === null || session.pointerId !== sample.pointerId) return;
      setPoint(sample.point);
      updatePreview(session, [sample.point]);
    },
    [updatePreview],
  );

  const moveBatch = useCallback(
    (samples: readonly EraserPointerSample[]) => {
      const session = sessionRef.current;
      if (session === null || samples.length === 0) return;
      const matching = samples.filter(
        ({ pointerId }) => pointerId === session.pointerId,
      );
      const last = matching.at(-1);
      if (last === undefined) return;
      setPoint(last.point);
      updatePreview(
        session,
        matching.map(({ point }) => point),
      );
    },
    [updatePreview],
  );

  const finish = useCallback(
    (sample: EraserPointerSample) => {
      const session = sessionRef.current;
      if (session === null || session.pointerId !== sample.pointerId) return;
      updatePreview(session, [sample.point]);
      sessionRef.current = null;
      setPoint(sample.point);
      setPreview(null);

      const current = getDocument();
      const plan = reconcileEraserGesture(session, current);
      const batchCommand = createBatchEraserCommand(
        createCommandMetadata(),
        current,
        plan.changes,
      );
      const groupCommand =
        plan.groupIds.length === 0
          ? null
          : {
              ...createCommandMetadata(),
              geometryImportIds: [],
              groupIds: plan.groupIds,
              kind: "core.clipboard.cut" as const,
              objectIds: plan.groupObjectIds,
              solidIds: plan.solidIds,
            };
      const commands = [
        ...(batchCommand === null ? [] : [batchCommand]),
        ...(groupCommand === null ? [] : [groupCommand]),
      ];
      if (commands.length === 0) return;

      const committed = commitCommands(commands);
      if (committed.ok) {
        announce(
          `Ластик: изменено объектов ${plan.affectedObjectIds.length}`,
        );
      }
    },
    [commitCommands, createCommandMetadata, getDocument, updatePreview, announce],
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
    preview,
    radiusPx: diameterPx / 2,
    setDiameterPx,
    start,
  } as const;
}

export type BoardEraserController = ReturnType<typeof useBoardEraserController>;
