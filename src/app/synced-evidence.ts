import type { BoardSyncState } from "../modules/server-sync/public";

export function canFinalizeBoardEvidence(state: BoardSyncState): boolean {
  return (
    state.kind === "ready" &&
    state.network === "online" &&
    state.pendingCount === 0 &&
    (state.role === "admin" || state.role === "tutor")
  );
}
