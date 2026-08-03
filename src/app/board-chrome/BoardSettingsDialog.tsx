import { useEffect, useRef, type ReactNode } from "react";

interface BoardSettingsDialogProps {
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly statusKind:
    "conflict" | "error" | "idle" | "saved" | "saving" | "scheduled";
  readonly statusLabel: string;
}

export function BoardSettingsDialog({
  children,
  onClose,
  open,
  statusKind,
  statusLabel,
}: BoardSettingsDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("button, a, input, textarea, select")
        ?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
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
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="board-settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        aria-label="Настройки доски"
        aria-modal="true"
        className="board-settings-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p>Настройки TutorBoard</p>
            <h2>Доска</h2>
          </div>
          <div className="board-settings-header-actions">
            <span
              className={`board-status-dot is-${statusKind}`}
              title={statusLabel}
            />
            <button
              aria-label="Закрыть настройки доски"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
        </header>
        <div className="board-settings-scroll">{children}</div>
      </aside>
    </div>
  );
}
