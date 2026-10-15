import { describe, expect, it, vi } from "vitest";

import {
  handoffCompletionUrl,
  readLessonBoardHandoff,
  verifyTutorAssistantHandoff,
} from "./lesson-board-handoff";

const lessonId = "f".repeat(32);
const token = "a".repeat(43);
const callback = `http://127.0.0.1:42117/complete?nonce=${token}`;

function fragment(value: unknown): string {
  const json = JSON.stringify(value);
  const encoded = btoa(
    String.fromCharCode(...new TextEncoder().encode(json)),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  return `#ta-start=${encoded}`;
}

describe("Tutor Assistant browser handoff", () => {
  it("accepts a valid loopback payload and preserves board identifiers", () => {
    const value = readLessonBoardHandoff(
      fragment({ version: 1, lessonId, title: "Геометрия", callback }),
    );
    expect(value).toEqual({ lessonId, title: "Геометрия", callback });
    expect(handoffCompletionUrl(value!, "board:123")).toBe(
      `http://127.0.0.1:42117/complete?nonce=${token}&boardId=board%3A123`,
    );
  });

  it("rejects arbitrary callbacks, credentials and malformed payloads", () => {
    for (const candidate of [
      "https://attacker.example/complete?nonce=" + token,
      "http://localhost:42117/complete?nonce=" + token,
      "http://127.0.0.1:42117/evil?nonce=" + token,
      "http://127.0.0.1:42117/complete?nonce=" + token + "&next=oops",
      "http://127.0.0.1:42117/complete?nonce=weak",
      "http://user@127.0.0.1:42117/complete?nonce=" + token,
    ]) {
      expect(
        readLessonBoardHandoff(
          fragment({
            version: 1,
            lessonId,
            title: "Геометрия",
            callback: candidate,
          }),
        ),
      ).toBeNull();
    }
    expect(readLessonBoardHandoff("#other=abc")).toBeNull();
    expect(
      readLessonBoardHandoff(
        fragment({ version: 1, lessonId: "other", title: "Тема", callback }),
      ),
    ).toBeNull();
    expect(() =>
      handoffCompletionUrl(
        { lessonId, title: "Тема", callback },
        "board/unsafe",
      ),
    ).toThrow();
  });

  it("requires a live loopback confirmation before board creation", async () => {
    const value = readLessonBoardHandoff(
      fragment({ version: 1, lessonId, title: "Геометрия", callback }),
    )!;
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true }),
    });
    vi.stubGlobal("fetch", fetchStub);
    try {
      await verifyTutorAssistantHandoff(value);
      expect(fetchStub).toHaveBeenCalledWith(
        `http://127.0.0.1:42117/prepare?nonce=${token}`,
        expect.objectContaining({ credentials: "omit", mode: "cors" }),
      );
      fetchStub.mockResolvedValueOnce({ ok: false });
      await expect(verifyTutorAssistantHandoff(value)).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
