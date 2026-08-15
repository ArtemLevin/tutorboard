import { describe, expect, it } from "vitest";

import { parseStandaloneBoardAccessContext } from "./standalone-board-contract";

const teacherFixture: unknown = {
  schemaVersion: "1.0",
  principalType: "teacher",
  actorId: "user:8b1eaf26-6f35-4a2e-b321-42b4a0c0d911",
  boardId: "board:71e2d27c-6933-40d5-a426-fd348aa220dd",
  role: "tutor",
  displayName: "Артём Александрович",
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
  csrfToken: "csrf-fixture-teacher-opaque",
  cacheScopeId: "scope:teacher:fixture-01",
  accessEpoch: "epoch:teacher:fixture-01",
  organizationId: "org:fixture-01",
  userId: "8b1eaf26-6f35-4a2e-b321-42b4a0c0d911",
};

const guestFixture: unknown = {
  schemaVersion: "1.0",
  principalType: "guest",
  actorId: "guest:9a1dc7b1-2a4f-49ce-a1a8-5dd845da9cd2",
  boardId: "board:71e2d27c-6933-40d5-a426-fd348aa220dd",
  role: "student",
  displayName: "Ксения",
  capabilities: [
    "board.read",
    "board.write",
    "board.snapshot.write",
    "collaboration.connect",
  ],
  csrfToken: "csrf-fixture-guest-opaque",
  cacheScopeId: "scope:guest:fixture-7f04",
  accessEpoch: "epoch:guest:fixture-03",
};

function guestFixtureRecord(): Record<string, unknown> {
  return { ...(guestFixture as Record<string, unknown>) };
}

describe("standalone board access contract", () => {
  it("parses the teacher fixture shape strictly", () => {
    const context = parseStandaloneBoardAccessContext(teacherFixture);

    expect(context.principalType).toBe("teacher");
    expect(context.capabilities).toContain("board.invites.manage");
  });

  it("parses the guest fixture shape strictly", () => {
    const context = parseStandaloneBoardAccessContext(guestFixture);

    expect(context.principalType).toBe("guest");
    expect(context.capabilities).toEqual([
      "board.read",
      "board.write",
      "board.snapshot.write",
      "collaboration.connect",
    ]);
  });

  it("rejects unknown fields", () => {
    expect(() =>
      parseStandaloneBoardAccessContext({
        ...guestFixtureRecord(),
        invitationSecret: "forbidden",
      }),
    ).toThrow();
  });

  it("rejects management capabilities for guests", () => {
    expect(() =>
      parseStandaloneBoardAccessContext({
        ...guestFixtureRecord(),
        capabilities: ["board.read", "board.invites.manage"],
      }),
    ).toThrow();
  });

  it("requires snapshot write to imply board write", () => {
    expect(() =>
      parseStandaloneBoardAccessContext({
        ...guestFixtureRecord(),
        capabilities: [
          "board.read",
          "board.snapshot.write",
          "collaboration.connect",
        ],
      }),
    ).toThrow();
  });
});
