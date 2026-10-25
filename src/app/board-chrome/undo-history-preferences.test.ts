import { describe, expect, it } from "vitest";

import {
  defaultUndoHistoryLimit,
  readUndoHistoryLimit,
  undoHistoryLimitOptions,
  undoHistoryLimitStorageKey,
  writeUndoHistoryLimit,
} from "./undo-history-preferences";

describe("Undo history preferences", () => {
  it("defaults to five and offers only bounded supported choices", () => {
    expect(defaultUndoHistoryLimit).toBe(5);
    expect(undoHistoryLimitOptions).toEqual([1, 3, 5, 10, 20, 50, 100]);
    expect(readUndoHistoryLimit(null)).toBe(5);
  });

  it("round-trips a selected limit and refuses invalid persisted input", () => {
    let raw: string | null = null;
    const storage = {
      getItem: (key: string) => {
        expect(key).toBe(undoHistoryLimitStorageKey);
        return raw;
      },
      setItem: (key: string, value: string) => {
        expect(key).toBe(undoHistoryLimitStorageKey);
        raw = value;
      },
    };
    writeUndoHistoryLimit(20, storage);
    expect(readUndoHistoryLimit(storage)).toBe(20);
    writeUndoHistoryLimit(500, storage);
    expect(readUndoHistoryLimit(storage)).toBe(20);
    raw = "1000000";
    expect(readUndoHistoryLimit(storage)).toBe(5);
    raw = "bad-value";
    expect(readUndoHistoryLimit(storage)).toBe(5);
  });

  it("tolerates localStorage access failures", () => {
    const blocked = {
      getItem: (): string => {
        throw new Error("SecurityError");
      },
      setItem: (): void => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readUndoHistoryLimit(blocked)).toBe(5);
    expect(() => writeUndoHistoryLimit(10, blocked)).not.toThrow();
  });
});
