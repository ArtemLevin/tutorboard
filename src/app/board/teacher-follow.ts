import type { BoardPresence } from "../../adapters/board-websocket/public";
import type { ViewportState } from "../../core/public";

export interface TeacherFollowSelection {
  readonly scope: string;
  readonly actorId: string;
  readonly clientId: string;
}

export interface TeacherFollowTarget {
  readonly displayName: string;
  readonly viewport: ViewportState;
}

/**
 * Server-origin presence supplies the trusted participant role and actor.
 * Validate again at the UI boundary to protect rendering and prevent invalid
 * zoom/offset values from influencing a guest's local camera.
 */
export function usableTeacherViewport(
  participant: BoardPresence,
): ViewportState | null {
  if (participant.role !== "tutor" && participant.role !== "admin") return null;
  const camera = participant.viewport;
  if (
    camera === null ||
    !Number.isFinite(camera.x) ||
    !Number.isFinite(camera.y) ||
    !Number.isFinite(camera.zoom) ||
    Math.abs(camera.x) > 1_000_000 ||
    Math.abs(camera.y) > 1_000_000 ||
    camera.zoom < 0.1 ||
    camera.zoom > 8
  ) {
    return null;
  }
  return {
    offset: { x: camera.x, y: camera.y },
    zoom: camera.zoom,
  };
}

export function chooseTeacher(
  participants: readonly BoardPresence[],
): BoardPresence | null {
  return (
    [...participants]
      .filter((item) => usableTeacherViewport(item) !== null)
      .sort((left, right) => left.clientId.localeCompare(right.clientId))[0] ??
    null
  );
}

/** Scope and exact actor/client identity prevent reconnect/epoch stale reuse. */
export function resolveTeacherFollow(
  selection: TeacherFollowSelection | null,
  scope: string,
  connected: boolean,
  participants: readonly BoardPresence[],
): TeacherFollowTarget | null {
  if (!connected || selection === null || selection.scope !== scope)
    return null;
  const participant = participants.find(
    (item) =>
      item.clientId === selection.clientId &&
      item.actorId === selection.actorId,
  );
  if (participant === undefined) return null;
  const viewport = usableTeacherViewport(participant);
  if (viewport === null) return null;
  return { displayName: participant.displayName, viewport };
}
