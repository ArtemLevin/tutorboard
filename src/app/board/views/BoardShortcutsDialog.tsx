import type { RefObject } from "react";

export interface BoardShortcutsDialogProps {
  readonly dialogRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

export function BoardShortcutsDialog({
  dialogRef,
  onClose,
}: BoardShortcutsDialogProps) {
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="shortcuts-title"
        aria-modal="true"
        className="shortcuts-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <div className="dialog-heading">
          <h2 id="shortcuts-title">Горячие клавиши</h2>
          <button
            aria-label="Закрыть горячие клавиши"
            autoFocus
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <dl>
          <div>
            <dt>H / V / A / P / I / L / R / E / N / T / F / G / K</dt>
            <dd>Инструменты и график</dd>
          </div>
          <div>
            <dt>Двойной щелчок правой кнопкой</dt>
            <dd>Настройки объекта</dd>
          </div>
          <div>
            <dt>Ctrl/Cmd + C, X, V</dt>
            <dd>Буфер обмена</dd>
          </div>
          <div>
            <dt>Ctrl/Cmd + Z / Shift+Z</dt>
            <dd>Отмена и повтор</dd>
          </div>
          <div>
            <dt>Delete / Escape / ?</dt>
            <dd>Удалить, закрыть, открыть справку</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
