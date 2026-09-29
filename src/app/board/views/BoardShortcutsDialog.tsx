import type { RefObject } from "react";

import { shortcutLabel } from "../shortcuts/board-shortcuts";

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
            <dt>
              {[
                shortcutLabel("tool.pan"),
                shortcutLabel("tool.select"),
                shortcutLabel("tool.lasso"),
                shortcutLabel("tool.pen"),
                shortcutLabel("tool.smart-ink"),
                shortcutLabel("tool.line"),
                shortcutLabel("tool.rectangle"),
                shortcutLabel("tool.ellipse"),
                shortcutLabel("tool.polygon"),
                shortcutLabel("tool.text"),
                shortcutLabel("tool.handwritten-function"),
                shortcutLabel("plot.create"),
                shortcutLabel("tool.laser"),
              ].join(" / ")}
            </dt>
            <dd>Инструменты и график</dd>
          </div>
          <div>
            <dt>1 / 2 / 3 / 4 / 5</dt>
            <dd>Основные цвета активного инструмента</dd>
          </div>
          <div>
            <dt>Shift во время построения</dt>
            <dd>Точная геометрия и привязка фигуры</dd>
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
