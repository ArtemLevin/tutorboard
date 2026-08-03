import { describe, expect, it, vi } from "vitest";

import { copyBoardShareUrl, createBoardShareUrl } from "./board-share";

const location = {
  origin: "https://class.example.test",
  pathname: "/board/",
  search: "?lessonId=lesson%3A42&documentId=document%3A42",
};

describe("board share link", () => {
  it("preserves the lesson-bound query and normalizes the board route", () => {
    expect(createBoardShareUrl(location)).toBe(
      "https://class.example.test/board/?lessonId=lesson%3A42&documentId=document%3A42#/board",
    );
  });

  it("copies the exact share URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyBoardShareUrl(location, { writeText })).resolves.toContain(
      "documentId=document%3A42",
    );
    expect(writeText).toHaveBeenCalledWith(createBoardShareUrl(location));
  });

  it("fails clearly when clipboard access is unavailable", async () => {
    await expect(copyBoardShareUrl(location, undefined)).rejects.toThrow(
      "Clipboard API is unavailable",
    );
  });
});
