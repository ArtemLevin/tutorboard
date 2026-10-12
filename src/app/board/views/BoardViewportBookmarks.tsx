import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewportState } from "../../../core/public";
import {
  bookmarkLimit,
  bookmarkName,
  bookmarkViewport,
  readBookmarks,
  writeBookmarks,
  type ViewportBookmark,
} from "../../board-chrome/viewport-bookmarks";
import "./BoardViewportBookmarks.css";

interface BoardViewportBookmarksProps {
  readonly storageScope: string;
  readonly viewport: ViewportState;
  readonly onNavigate: (viewport: ViewportState) => void;
}

export function BoardViewportBookmarks({
  storageScope,
  viewport,
  onNavigate,
}: BoardViewportBookmarksProps) {
  const [open, setOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState(() => readBookmarks(storageScope));
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const save = useCallback(
    (next: ViewportBookmark[]) => {
      setBookmarks(next);
      writeBookmarks(storageScope, next);
    },
    [storageScope],
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const add = () => {
    if (bookmarks.length >= bookmarkLimit) return;
    const camera = bookmarkViewport(viewport);
    if (camera === null) return;
    const name = bookmarkName(draft) || `Область ${bookmarks.length + 1}`;
    save([...bookmarks, { id: crypto.randomUUID(), name, viewport: camera }]);
    setDraft("");
  };

  const finishRename = (item: ViewportBookmark) => {
    const nextName = bookmarkName(editName);
    if (nextName) save(bookmarks.map((current) =>
      current.id === item.id ? { ...current, name: nextName } : current,
    ));
    setEditingId(null);
  };

  return (
    <div className="board-viewport-bookmarks" ref={root}>
      <button
        aria-controls="viewport-bookmarks-list"
        aria-expanded={open}
        aria-label="Закладки областей"
        className="viewport-bookmarks-trigger"
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >
        <span aria-hidden="true">▣</span> Закладки {bookmarks.length > 0 ? `(${bookmarks.length})` : ""}
      </button>
      {open ? (
        <section
          aria-label="Сохранённые области доски"
          className="viewport-bookmarks-panel"
          id="viewport-bookmarks-list"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              setEditingId(null);
              trigger.current?.focus();
            }
          }}
        >
          <header>
            <strong>Области доски</strong>
            <span>{bookmarks.length}/{bookmarkLimit}</span>
          </header>
          {bookmarks.length === 0 ? (
            <p>Сохраните область для быстрого возврата во время занятия.</p>
          ) : (
            <ul>
              {bookmarks.map((item) => (
                <li key={item.id}>
                  {editingId === item.id ? (
                    <input
                      aria-label={`Новое название: ${item.name}`}
                      autoFocus
                      maxLength={48}
                      onChange={(event) => setEditName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") finishRename(item);
                      }}
                      value={editName}
                    />
                  ) : (
                    <button
                      aria-label={`Перейти: ${item.name}`}
                      className="viewport-bookmarks-go"
                      onClick={() => {
                        onNavigate(item.viewport);
                        setOpen(false);
                        trigger.current?.focus();
                      }}
                      type="button"
                    >{item.name}</button>
                  )}
                  <button
                    aria-label={editingId === item.id ? `Сохранить название: ${item.name}` : `Переименовать: ${item.name}`}
                    onClick={() => {
                      if (editingId === item.id) finishRename(item);
                      else { setEditingId(item.id); setEditName(item.name); }
                    }}
                    type="button"
                  >{editingId === item.id ? "✓" : "✎"}</button>
                  <button
                    aria-label={`Удалить: ${item.name}`}
                    onClick={() => {
                      save(bookmarks.filter((entry) => entry.id !== item.id));
                      if (editingId === item.id) setEditingId(null);
                    }}
                    type="button"
                  >×</button>
                </li>
              ))}
            </ul>
          )}
          <div className="viewport-bookmarks-add">
            <input
              aria-label="Название новой области"
              maxLength={48}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") add();
              }}
              placeholder="Теория, задача 1…"
              value={draft}
            />
            <button
              disabled={bookmarks.length >= bookmarkLimit}
              onClick={add}
              type="button"
            >Сохранить область</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
