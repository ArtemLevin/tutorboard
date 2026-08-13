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
    actorId: actorId("actor:tutor"),
    confirmedSha256: "a".repeat(64),
    document: createEmptyBoardDocument({
      createdAt: "2026-08-12T12:00:00.000Z",
      id: documentId("document:evidence"),
      title: "Evidence",
    }),
    kind: "ready",
    network: "online",
    pendingCount: 0,
    revision: 4,
    role: "tutor",
    ...overrides,
  };
}

describe("board evidence finalization guard", () => {
  it("allows only an exact online head without pending commands", () => {
    expect(canFinalizeBoardEvidence(ready())).toBe(true);
    expect(canFinalizeBoardEvidence(ready({ pendingCount: 1 }))).toBe(false);
    expect(canFinalizeBoardEvidence(ready({ network: "offline" }))).toBe(false);
    expect(canFinalizeBoardEvidence(ready({ role: "student" }))).toBe(false);
    expect(canFinalizeBoardEvidence({ kind: "bootstrapping" })).toBe(false);
  });
});
