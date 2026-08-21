import { describe, expect, it } from "vitest";

import { canFinalizeBoardEvidence } from "../../../src/app/synced-evidence";
import {
  actorId,
  createEmptyBoardDocument,
  documentId,
} from "../../../src/core/public";
import type { BoardSyncState } from "../../../src/modules/server-sync/public";

function ready(
  overrides: Partial<Extract<BoardSyncState, { kind: "ready" }>> = {},
): Extract<BoardSyncState, { kind: "ready" }> {
  return {
    accessEpoch: "legacy:access:v1",
    actorId: actorId("actor:tutor"),
    capabilities: [
      "board.read",
      "board.write",
      "board.snapshot.write",
      "collaboration.connect",
      "board.export",
      "board.history.read",
      "board.invites.manage",
      "board.archive",
      "board.delete",
    ],
    confirmedSha256: "a".repeat(64),
    document: createEmptyBoardDocument({
      createdAt: "2026-08-12T12:00:00.000Z",
      id: documentId("document:evidence"),
      title: "Evidence",
    }),
    kind: "ready",
    network: "online",
    pendingCount: 0,
    principalType: "legacy",
    quarantinedCount: 0,
    revision: 4,
    role: "tutor",
    ...overrides,
  };
}

describe("board evidence finalization guard", () => {
  it("allows only an exact online head without pending commands", () => {
    expect(canFinalizeBoardEvidence(ready())).toBe(true);
    expect(canFinalizeBoardEvidence(ready({ pendingCount: 1 }))).toBe(false);
    expect(canFinalizeBoardEvidence(ready({ quarantinedCount: 1 }))).toBe(
      false,
    );
    expect(canFinalizeBoardEvidence(ready({ network: "offline" }))).toBe(false);
    expect(canFinalizeBoardEvidence(ready({ role: "student" }))).toBe(false);
    expect(canFinalizeBoardEvidence({ kind: "bootstrapping" })).toBe(false);
  });
});
