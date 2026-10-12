import { describe, expect, it } from "vitest";
import { bookmarkKey, bookmarkLimit, bookmarkSchema, normalizeBookmarks, readBookmarks, writeBookmarks } from "./viewport-bookmarks";

const viewport = { offset: { x: -100.125, y: 5_000_000 }, zoom: 2.4 };

describe("viewport bookmarks", () => {
  it("isolates per-board and per-actor preferences", () => {
    expect(bookmarkKey("teacher/one")).not.toBe(bookmarkKey("teacher/two"));
    expect(bookmarkKey("teacher/one")).not.toBe(bookmarkKey("guest/one"));
  });

  it("normalizes input, rejects invalid camera coordinates and duplicate IDs", () => {
    const list = normalizeBookmarks({
      schemaVersion: bookmarkSchema,
      bookmarks: [
        { id: "1", name: " Теория ", viewport },
        { id: "1", name: "Again", viewport },
        { id: "2", name: "Bad zoom", viewport: { offset: { x: 0, y: 0 }, zoom: 200 } },
        { id: "3", name: "Bad offset", viewport: { offset: { x: "bad", y: 0 }, zoom: 1 } },
        { id: "4", name: " ", viewport },
      ],
    });
    expect(list).toEqual([{ id: "1", name: "Теория", viewport }]);
    expect(normalizeBookmarks({ schemaVersion: "old", bookmarks: [] })).toEqual([]);
  });

  it("bounds count and survives corrupt/unavailable storage", () => {
    const bookmarks = Array.from({ length: 25 }, (_, i) => ({
      id: String(i), name: `Задача ${i}`, viewport,
    }));
    expect(normalizeBookmarks({ schemaVersion: bookmarkSchema, bookmarks })).toHaveLength(bookmarkLimit);
    expect(readBookmarks("scope", { getItem: () => "{bad" })).toEqual([]);
    expect(readBookmarks("scope", { getItem: () => "x".repeat(24001) })).toEqual([]);
    expect(() => writeBookmarks("scope", bookmarks, {
      setItem: () => { throw new Error("quota"); },
    })).not.toThrow();
  });

  it("round-trips exact camera values without writing board content", () => {
    const values = new Map<string, string>();
    const store = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const bookmarks = [{ id: "area:1", name: "Домашняя работа", viewport }];
    writeBookmarks("teacher/board", bookmarks, store);
    expect(readBookmarks("teacher/board", store)).toEqual(bookmarks);
    expect(readBookmarks("guest/board", store)).toEqual([]);
    expect(values.get(bookmarkKey("teacher/board"))).not.toContain("BoardDocument");
  });
});
