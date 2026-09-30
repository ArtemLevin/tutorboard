import { useCallback, useRef, useState } from "react";

import {
  boardObjectId,
  selectBoardScene,
  type BoardObject,
  type BoardObjectId,
  type Vec2,
} from "../../../core/public";
import { createEraserCommand, erasePenStroke } from "../../../modules/eraser/public";
import { selectObjectIdsNearPath } from "../../../modules/selection/public";
import type { BoardDocumentController } from "./useBoardDocumentController";

interface EraserPointerSample {
  readonly point: Vec2;
  readonly pointerId: number;
}

interface EraserSession {
  readonly fragmentIds: Map<string, BoardObjectId>;
  readonly pointerId: number;
  readonly path: Vec2[];
}

export interface EraserPreview {
  readonly hiddenObjectIds: readonly BoardObjectId[];
  readonly replacementObjects: readonly BoardObject[];
}

interface EraserComputation extends EraserPreview {
  readonly changedPenStrokes: readonly {
    readonly original: Extract<
      BoardObject,
      { readonly kind: "drawing.pen-stroke" }
    >;
    readonly replacements: readonly Extract<
      BoardObject,
      { readonly kind: "drawing.pen-stroke" }
    >[];
  }[];
  readonly deletedGroupIds: readonly string[];
  readonly deletedObjectIds: readonly BoardObjectId[];
  readonly deletedSolidIds: readonly string[];
}

const maximumGesturePoints = 4096;
const eraserPreferencesStorageKey = "tutorboard.eraser-preferences/1";
const defaultEraserDiameterPx = 24;
const minimumEraserDiameterPx = 8;
const maximumEraserDiameterPx = 96;

function normalizeDiameter(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(
        maximumEraserDiameterPx,
        Math.max(minimumEraserDiameterPx, Math.round(value / 4) * 4),
      )
    : defaultEraserDiameterPx;
}

function readDiameter(): number {
  if (typeof window === "undefined") return defaultEraserDiameterPx;
  try {
    const raw = window.localStorage.getItem(eraserPreferencesStorageKey);
    if (raw === null) return defaultEraserDiameterPx;
    const parsed = JSON.parse(raw) as { readonly diameterPx?: unknown };
    return normalizeDiameter(parsed.diameterPx);
  } catch {
    return defaultEraserDiameterPx;
  }
}

function writeDiameter(diameterPx: number): void {
  try {
    window.localStorage.setItem(
      eraserPreferencesStorageKey,
      JSON.stringify({ diameterPx }),
    );
  } catch {
    // Browser storage is optional; the in-memory preference still applies.
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

function computeEraser(
  document: ReturnType<BoardDocumentController["getDocument"]>,
  session: EraserSession,
  diameterPx: number,
): EraserComputation {
  const radiusWorld = diameterPx / 2 / document.viewport.zoom;
  const scene = selectBoardScene(document);
  const hitIds = selectObjectIdsNearPath(scene, session.path, radiusWorld);
  const deletedGroups = new Set<string>();
  const deletedObjects = new Set<BoardObjectId>();
  const hiddenObjects = new Set<BoardObjectId>();
  const changedPenStrokes: EraserComputation["changedPenStrokes"][number][] =
    [];

  for (const id of hitIds) {
    const object = document.objects[id];
    if (
      object === undefined ||
      object.source.kind !== "user" ||
      object.locked ||
      !object.visible ||
      object.groupId === null
    ) {
      continue;
    }
    const group = document.groups[object.groupId];
    if (
      group === undefined ||
      group.locked ||
      group.objectIds.some((memberId) => {
        const member = document.objects[memberId];
        return (
          member === undefined ||
          member.locked ||
          member.source.kind !== "user"
        );
      })
    ) {
      continue;
    }
    deletedGroups.add(group.id);
    for (const memberId of group.objectIds) hiddenObjects.add(memberId);
  }

  for (const id of hitIds) {
    const object = document.objects[id];
    if (
      object === undefined ||
      object.source.kind !== "user" ||
      object.locked ||
      !object.visible ||
      (object.groupId !== null && deletedGroups.has(object.groupId))
    ) {
      continue;
    }
    if (object.groupId !== null) continue;

    if (object.kind === "drawing.pen-stroke") {
      const replacements = erasePenStroke(
        object,
        session.path,
        radiusWorld,
        (original, fragmentIndex) => {
          if (fragmentIndex === 0) return original.id;
          const key = `${original.id}:${fragmentIndex}`;
          const existing = session.fragmentIds.get(key);
          if (existing !== undefined) return existing;
          const created = boardObjectId(`object:${crypto.randomUUID()}`);
          session.fragmentIds.set(key, created);
          return created;
        },
      );
      if (replacements === null) continue;
      hiddenObjects.add(object.id);
      changedPenStrokes.push({ original: object, replacements });
      continue;
    }

    deletedObjects.add(object.id);
    hiddenObjects.add(object.id);
  }

  const deletedSolidIds = Object.values(document.solidModels).flatMap(
    (solid) =>
      solid !== undefined && deletedGroups.has(solid.rootGroupId)
        ? [solid.id]
        : [],
  );

  return {
    changedPenStrokes,
    deletedGroupIds: [...deletedGroups],
    deletedObjectIds: [...deletedObjects],
    deletedSolidIds,
    hiddenObjectIds: [...hiddenObjects],
    replacementObjects: changedPenStrokes.flatMap(
      ({ replacements }) => replacements,
    ),
  };
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
  const sessionRef = useRef<EraserSession | null>(null);
  const [point, setPoint] = useState<Vec2 | null>(null);
  const [preview, setPreview] = useState<EraserPreview | null>(null);
  const [diameterPx, setDiameterPxState] = useState(readDiameter);

  const updatePreview = useCallback(
    (session: EraserSession) => {
      setPreview(computeEraser(getDocument(), session, diameterPx));
    },
    [diameterPx, getDocument],
  );

  const setDiameterPx = useCallback((value: number) => {
    const normalized = normalizeDiameter(value);
    setDiameterPxState(normalized);
    writeDiameter(normalized);
  }, []);

  const hover = useCallback((nextPoint: Vec2 | null) => {
    setPoint(nextPoint);
  }, []);

  const start = useCallback(
    (sample: EraserPointerSample) => {
      const session: EraserSession = {
        fragmentIds: new Map(),
        path: [sample.point],
        pointerId: sample.pointerId,
      };
      sessionRef.current = session;
      setPoint(sample.point);
      updatePreview(session);
    },
    [updatePreview],
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
      for (const sample of samples) {
        if (sample.pointerId === session.pointerId) {
          appendPoint(session.path, sample.point);
        }
      }
      const last = samples.at(-1);
      if (last !== undefined && last.pointerId === session.pointerId) {
        setPoint(last.point);
        updatePreview(session);
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

      const current = getDocument();
      const result = computeEraser(current, session, diameterPx);
      setPreview(null);

      const deletedObjectIds = new Set(result.deletedObjectIds);
      const replaceCommands = result.changedPenStrokes.flatMap(
        ({ original, replacements }) => {
          if (replacements.length === 0) {
            deletedObjectIds.add(original.id);
            return [];
          }
          return [
            createEraserCommand(createCommandMetadata(), [original], replacements),
          ];
        },
      );
      const commands = [
        ...replaceCommands,
        ...(deletedObjectIds.size === 0
          ? []
          : [
              {
                ...createCommandMetadata(),
                kind: "core.objects.delete" as const,
                objectIds: [...deletedObjectIds],
              },
            ]),
        ...(result.deletedGroupIds.length === 0
          ? []
          : [
              {
                ...createCommandMetadata(),
                geometryImportIds: [],
                groupIds: result.deletedGroupIds,
                kind: "core.clipboard.cut" as const,
                objectIds: result.deletedGroupIds.flatMap(
                  (groupId) => current.groups[groupId]?.objectIds ?? [],
                ),
                solidIds: result.deletedSolidIds,
              },
            ]),
      ];
      if (commands.length === 0) return;

      const committed = commitCommands(commands);
      if (committed.ok) {
        announce(`Ластик: изменено объектов ${result.hiddenObjectIds.length}`);
      }
    },
    [announce, commitCommands, createCommandMetadata, diameterPx, getDocument],
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
