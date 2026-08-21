import { describe, expect, it } from "vitest";

import { readBoardLaunchContext } from "../../../src/app/configuration/board-launch-context";

describe("BoardLaunchContext", () => {
  it("keeps the local entry point local", () => {
    expect(readBoardLaunchContext({ pathname: "/", search: "" })).toEqual({
      kind: "local",
    });
  });

  it("preserves the legacy lesson query contract", () => {
    expect(
      readBoardLaunchContext({
        pathname: "/",
        search: "?lessonId=lesson%3A1&documentId=document%3Alesson-1",
      }),
    ).toEqual({
      documentId: "document:lesson-1",
      kind: "legacy-lesson",
      lessonId: "lesson:1",
    });
  });

  it("recognizes a standalone board route without credentials", () => {
    expect(
      readBoardLaunchContext({
        pathname: "/b/document%3Astandalone-1",
        search: "",
      }),
    ).toEqual({
      boardId: "document:standalone-1",
      kind: "standalone",
    });
  });

  it("rejects incomplete legacy identifiers", () => {
    expect(() =>
      readBoardLaunchContext({
        pathname: "/",
        search: "?lessonId=lesson%3A1",
      }),
    ).toThrow("lessonId and documentId");
  });
});
