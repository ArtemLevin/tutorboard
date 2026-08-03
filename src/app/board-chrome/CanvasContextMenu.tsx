import { useEffect, useRef } from "react";

import type { Vec2 } from "../../core/public";

export interface CanvasContextMenuProps {
  readonly canClear: boolean;
  readonly canPaste: boolean;
  readonly disabled: boolean;
  readonly onClearRequest: () => void;
  readonly onClose: () => void;
  readonly onPaste: () => void;
  readonly onText: () => void;
  readonly position: Vec2;
}

const menuWidth = 216;
const menuHeight = 154;
const viewportMargin = 8;

export function CanvasContextMenu({
  canClear,
  canPaste,
  disabled,
  onClearRequest,
  onClose,
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
  const top = Math.max(
    viewportMargin,
    Math.min(position.y, window.innerHeight - menuHeight - viewportMargin),
  );

  useEffect(() => {
    firstItemRef.current?.focus();
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
      }
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
      aria-label="Меню холста"
      className="canvas-context-menu"
      ref={menuRef}
      role="menu"
      style={{ left, top }}
    >
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

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="clear-canvas-backdrop">
      <section
        aria-describedby="clear-canvas-description"
        aria-labelledby="clear-canvas-title"
        aria-modal="true"
        className="clear-canvas-dialog"
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
