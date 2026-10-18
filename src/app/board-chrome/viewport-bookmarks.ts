import type { ViewportState } from "../../core/public";
import { boardFitZoomBounds } from "../board/viewport-fit";

export const bookmarkSchema = "tutorboard.viewport-bookmarks/1";
export const bookmarkLimit = 10;
export const bookmarkVisibilityStorageKey =
  "tutorboard.viewport-bookmarks.visible/1";

export interface ViewportBookmark {
  readonly id: string;
  readonly name: string;
  readonly viewport: ViewportState;
}

export const bookmarkKey = (scope: string): string =>
  `${bookmarkSchema}:${encodeURIComponent(scope)}`;

export const bookmarkName = (value: unknown): string =>
  typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 48)
    : "";

export function bookmarkViewport(value: unknown): ViewportState | null {
  if (value === null || typeof value !== "object") return null;
  const input = value as { zoom?: unknown; offset?: unknown };
  if (input.offset === null || typeof input.offset !== "object") return null;
  const offset = input.offset as { x?: unknown; y?: unknown };
  if (
    typeof input.zoom !== "number" ||
    !Number.isFinite(input.zoom) ||
    input.zoom < boardFitZoomBounds.minimum ||
    input.zoom > boardFitZoomBounds.maximum ||
    typeof offset.x !== "number" ||
    typeof offset.y !== "number" ||
    !Number.isFinite(offset.x) ||
    !Number.isFinite(offset.y) ||
    Math.abs(offset.x) > 1e9 ||
    Math.abs(offset.y) > 1e9
  )
    return null;
  return { offset: { x: offset.x, y: offset.y }, zoom: input.zoom };
}

export function normalizeBookmarks(input: unknown): ViewportBookmark[] {
  if (input === null || typeof input !== "object") return [];
  const data = input as { schemaVersion?: unknown; bookmarks?: unknown };
  if (data.schemaVersion !== bookmarkSchema || !Array.isArray(data.bookmarks))
    return [];
  const bookmarks: ViewportBookmark[] = [];
  const ids = new Set<string>();
  for (const raw of data.bookmarks.slice(0, 100)) {
    if (raw === null || typeof raw !== "object") continue;
    const item = raw as { id?: unknown; name?: unknown; viewport?: unknown };
    const name = bookmarkName(item.name);
    const viewport = bookmarkViewport(item.viewport);
    if (
      typeof item.id !== "string" ||
      item.id.length === 0 ||
      item.id.length > 80 ||
      ids.has(item.id) ||
      !name ||
      viewport === null
    )
      continue;
    ids.add(item.id);
    bookmarks.push({ id: item.id, name, viewport });
    if (bookmarks.length === bookmarkLimit) break;
  }
  return bookmarks;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readBookmarkVisibility(
  storage: Pick<Storage, "getItem"> | null = safeStorage(),
): boolean {
  try {
    return storage?.getItem(bookmarkVisibilityStorageKey) === "true";
  } catch {
    return false;
  }
}

export function writeBookmarkVisibility(
  visible: boolean,
  storage: Pick<Storage, "setItem"> | null = safeStorage(),
): void {
  try {
    storage?.setItem(bookmarkVisibilityStorageKey, String(visible));
  } catch {
    // The bookmark data remains untouched if preference storage is unavailable.
  }
}

export function readBookmarks(
  scope: string,
  storage: Pick<Storage, "getItem"> | null = safeStorage(),
): ViewportBookmark[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(bookmarkKey(scope));
    return raw === null || raw.length > 24000
      ? []
      : normalizeBookmarks(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeBookmarks(
  scope: string,
  bookmarks: readonly ViewportBookmark[],
  storage: Pick<Storage, "setItem"> | null = safeStorage(),
): void {
  try {
    storage?.setItem(
      bookmarkKey(scope),
      JSON.stringify({
        schemaVersion: bookmarkSchema,
        bookmarks: normalizeBookmarks({
          schemaVersion: bookmarkSchema,
          bookmarks,
        }),
      }),
    );
  } catch {
    // Preferences remain usable in memory when localStorage is disabled or full.
  }
}
