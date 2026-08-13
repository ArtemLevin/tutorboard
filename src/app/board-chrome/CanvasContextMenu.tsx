import { useEffect, useRef } from "react";

import type { Vec2 } from "../../core/public";

export interface CanvasContextMenuProps {
  readonly canClear: boolean;
  readonly canCopy: boolean;
  readonly canPaste: boolean;
  readonly canOpenSolid3D?: boolean;
  readonly canEdit?: boolean;
  readonly context: "canvas" | "selection";
  readonly disabled: boolean;
  readonly onClearRequest: () => void;
  readonly onClose: () => void;
  readonly onCopy: () => void;
  readonly onEdit?: () => void;
  readonly onOpenSolid3D?: () => void;
  readonly onPaste: () => void;
  readonly onText: () => void;
  readonly position: Vec2;
}

const menuWidth = 216;
const canvasMenuHeight = 154;
const selectionMenuHeight = 154;
const viewportMargin = 8;

export function CanvasContextMenu({
  canClear,
  canCopy,
  canPaste,
  canOpenSolid3D = false,
  canEdit = false,
  context,
  disabled,
  onClearRequest,
  onClose,
  onCopy,
  onEdit = () => {},
  onOpenSolid3D = () => {},
  onPaste,
  onText,
  position,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const left = Math.max(
    viewportMargin,
    Math.min(position.x, window.innerWidth - menuWidth - viewportMargin),
  );
  const menuHeight =
    context === "selection" ? selectionMenuHeight : canvasMenuHeight;
  const top = Math.max(
    viewportMargin,
    Math.min(position.y, window.innerHeight - menuHeight - viewportMargin),
  );

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = [
        ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? []),
      ];
      if (items.length === 0) return;
      event.preventDefault();
      const current = Math.max(
        0,
        items.indexOf(document.activeElement as HTMLButtonElement),
      );
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[index]?.focus();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <section
      aria-label={context === "selection" ? "Меню выделения" : "Меню холста"}
      className="canvas-context-menu"
      ref={menuRef}
      role="menu"
      style={{ left, top }}
    >
      {context === "selection" ? (
        <>
          <button
            disabled={!canEdit}
            onClick={onEdit}
            ref={firstItemRef}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true">✎</span>
            Редактировать
          </button>
          <button
            disabled={!canCopy}
            onClick={onCopy}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true">⧉</span>
            Копировать
          </button>
          {canOpenSolid3D ? (
            <button onClick={onOpenSolid3D} role="menuitem" type="button">
              <span aria-hidden="true">◇</span>
              Открыть в 3D
            </button>
          ) : null}
        </>
      ) : (
        <>
          <button
            disabled={disabled}
            onClick={onText}
            ref={firstItemRef}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true">T</span>
            Текст
          </button>
          <button
            disabled={disabled || !canPaste}
            onClick={onPaste}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true">⌘</span>
            Вставить
          </button>
          <div className="canvas-context-menu__separator" role="separator" />
          <button
            className="is-danger"
            disabled={disabled || !canClear}
            onClick={onClearRequest}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true">×</span>
            Очистить холст
          </button>
        </>
      )}
    </section>
  );
}

export interface ClearCanvasDialogProps {
  readonly objectCount: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ClearCanvasDialog({
  objectCount,
  onCancel,
  onConfirm,
}: ClearCanvasDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const items = [
        ...dialogRef.current.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ),
      ];
      const first = items[0];
      const last = items.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [onCancel]);

  return (
    <div className="clear-canvas-backdrop">
      <section
        aria-describedby="clear-canvas-description"
        aria-labelledby="clear-canvas-title"
        aria-modal="true"
        className="clear-canvas-dialog"
        ref={dialogRef}
        role="alertdialog"
      >
        <h2 id="clear-canvas-title">Очистить холст?</h2>
        <p id="clear-canvas-description">
          Будут удалены все объекты ({objectCount}). Действие можно отменить.
        </p>
        <div>
          <button onClick={onCancel} ref={cancelRef} type="button">
            Отмена
          </button>
          <button className="is-danger" onClick={onConfirm} type="button">
            Очистить
          </button>
        </div>
      </section>
    </div>
  );
}
