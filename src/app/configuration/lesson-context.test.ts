import { describe, expect, it } from "vitest";

import { readLessonBoardContext } from "./lesson-context";

describe("readLessonBoardContext", () => {
  it("returns a complete lesson-bound board context", () => {
    expect(
      readLessonBoardContext(
        "?lessonId=lesson%3A42&documentId=document%3Alesson-42",
      ),
    ).toEqual({
      documentId: "document:lesson-42",
      lessonId: "lesson:42",
    });
  });

  it("keeps local mode when no context is supplied", () => {
    expect(readLessonBoardContext("")).toBeNull();
  });

  it("rejects partial or unsafe context", () => {
    expect(() => readLessonBoardContext("?lessonId=lesson:42")).toThrow(
      "lessonId and documentId",
    );
    expect(() =>
      readLessonBoardContext(
        "?lessonId=lesson:42&documentId=document%2Foutside",
      ),
    ).toThrow("lessonId and documentId");
  });
});
