import { describe, expect, it } from "vitest";

import { actorId, documentId } from "../../../src/core/public";
import {
  boardMutationPolicyFromAccess,
  createLegacyBoardAccessContext,
  legacyBoardAccessEpoch,
  legacyBoardCacheScopeId,
} from "../../../src/core/access/public";

describe("board access contracts", () => {
  it("maps a legacy tutor to the isolated legacy scope with write capability", () => {
    const context = createLegacyBoardAccessContext(
      {
        actorId: actorId("user:tutor"),
        csrfToken: "csrf-token",
        organizationId: "organization:1",
        role: "tutor",
      },
      documentId("document:lesson"),
    );

    expect(context).toMatchObject({
      accessEpoch: legacyBoardAccessEpoch,
      cacheScopeId: legacyBoardCacheScopeId,
      principalType: "legacy",
    });
    expect(context.capabilities).toContain("board.write");
    expect(boardMutationPolicyFromAccess(context)).toEqual({
      canWrite: true,
      reason: "allowed",
    });
  });

  it("maps a legacy parent to read-only capabilities", () => {
    const context = createLegacyBoardAccessContext(
      {
        actorId: actorId("user:parent"),
        csrfToken: "csrf-token",
        organizationId: "organization:1",
        role: "parent",
      },
      documentId("document:lesson"),
    );

    expect(context.capabilities).not.toContain("board.write");
    expect(context.capabilities).not.toContain("board.snapshot.write");
    expect(boardMutationPolicyFromAccess(context)).toEqual({
      canWrite: false,
      reason: "missing-board-write",
    });
  });
});
