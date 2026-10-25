import { useCallback, useState } from "react";

export const defaultUndoHistoryLimit = 5;
export const undoHistoryLimitOptions = [1, 3, 5, 10, 20, 50, 100] as const;
export const undoHistoryLimitStorageKey = "tutorboard.undo-history-limit.v1";

export function isUndoHistoryLimit(value: number): boolean {
  return undoHistoryLimitOptions.some((option) => option === value);
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readUndoHistoryLimit(
  storage: Pick<Storage, "getItem"> | null = localStorageOrNull(),
): number {
  try {
    const raw = storage?.getItem(undoHistoryLimitStorageKey);
    if (raw === null || raw === undefined) return defaultUndoHistoryLimit;
    const value = Number(raw);
    return isUndoHistoryLimit(value) ? value : defaultUndoHistoryLimit;
  } catch {
    return defaultUndoHistoryLimit;
  }
}

export function writeUndoHistoryLimit(
  limit: number,
  storage: Pick<Storage, "setItem"> | null = localStorageOrNull(),
): void {
  if (!isUndoHistoryLimit(limit)) return;
  try {
    storage?.setItem(undoHistoryLimitStorageKey, String(limit));
  } catch {
    // Blocked storage must not prevent the active session from changing limits.
  }
}

export function useUndoHistoryLimit() {
  const [limit, setLimit] = useState(readUndoHistoryLimit);
  const changeLimit = useCallback((next: number) => {
    if (!isUndoHistoryLimit(next)) return;
    writeUndoHistoryLimit(next);
    setLimit(next);
  }, []);
  return { limit, changeLimit } as const;
}
