import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseStandaloneBoardAccessContext } from "./standalone-board-contract";

function fixture(name: string): unknown {
  const url = new URL(
    `../../contracts/standalone-board/fixtures/${name}`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

describe("standalone board access contract", () => {
  it("parses the teacher fixture strictly", () => {
    const context = parseStandaloneBoardAccessContext(
      fixture("teacher-context.json"),
    );

    expect(context.principalType).toBe("teacher");
    expect(context.capabilities).toContain("board.invites.manage");
  });

  it("parses the guest fixture strictly", () => {
    const context = parseStandaloneBoardAccessContext(
      fixture("guest-context.json"),
    );

    expect(context.principalType).toBe("guest");
    expect(context.capabilities).toEqual([
      "board.read",
      "board.write",
      "board.snapshot.write",
      "collaboration.connect",
    ]);
  });

  it("rejects unknown fields", () => {
    const value = fixture("guest-context.json") as Record<string, unknown>;
    expect(() =>
      parseStandaloneBoardAccessContext({
        ...value,
        invitationSecret: "forbidden",
      }),
    ).toThrow();
  });

  it("rejects management capabilities for guests", () => {
    const value = fixture("guest-context.json") as Record<string, unknown>;
    expect(() =>
      parseStandaloneBoardAccessContext({
        ...value,
        capabilities: ["board.read", "board.invites.manage"],
      }),
    ).toThrow();
  });

  it("requires snapshot write to imply board write", () => {
    const value = fixture("guest-context.json") as Record<string, unknown>;
    expect(() =>
      parseStandaloneBoardAccessContext({
        ...value,
        capabilities: [
          "board.read",
          "board.snapshot.write",
          "collaboration.connect",
        ],
      }),
    ).toThrow();
  });
});
