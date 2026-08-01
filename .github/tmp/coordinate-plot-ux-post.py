from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected fragment not found: {label}")
    return text.replace(old, new, 1)


test_path = Path("src/app/CoordinatePlotEditorPanel.accessibility.test.tsx")
test_text = test_path.read_text(encoding="utf-8")
test_text = replace_once(
    test_text,
    'import { createDefaultCoordinatePlotObject } from "../modules/coordinate-plot-editor/public";',
    '''import {
  createDefaultCoordinatePlotObject,
  type CoordinatePlotEditorIssue,
} from "../modules/coordinate-plot-editor/public";''',
    "test issue import",
)
test_text = replace_once(
    test_text,
    '''function renderPanel({
  dirty = true,
  issues = [],
  onClose = vi.fn(),
  onSave = vi.fn(() => true),
}: {
  readonly dirty?: boolean;
  readonly issues?: readonly {
    readonly blocking: boolean;
    readonly code: string;
    readonly end?: number;
    readonly field: string;
    readonly message: string;
    readonly start?: number;
  }[];
  readonly onClose?: ReturnType<typeof vi.fn>;
  readonly onSave?: ReturnType<typeof vi.fn>;
} = {}) {''',
    '''function renderPanel({
  dirty = true,
  issues = [],
  onClose = vi.fn<() => void>(),
  onSave = vi.fn<() => boolean>(() => true),
}: {
  readonly dirty?: boolean;
  readonly issues?: readonly CoordinatePlotEditorIssue[];
  readonly onClose?: () => void;
  readonly onSave?: () => boolean;
} = {}) {''',
    "test helper types",
)
test_path.write_text(test_text, encoding="utf-8")

panel_path = Path("src/app/CoordinatePlotEditorPanel.tsx")
panel_text = panel_path.read_text(encoding="utf-8")
panel_text = replace_once(
    panel_text,
    '''import {
  useEffect,''',
    '''import {
  useCallback,
  useEffect,''',
    "useCallback import",
)

pattern = re.compile(
    r'''  const focusEditor = \(preferred: HTMLElement \| null = null\) => \{.*?  \}, \[canSave, closeConfirmationOpen, dirty, onClose, onSave\]\);''',
    re.DOTALL,
)
replacement = '''  const focusEditor = useCallback((preferred: HTMLElement | null = null) => {
    const target =
      preferred?.isConnected === true
        ? preferred
        : editorRef.current?.querySelector<HTMLElement>(
            "[data-plot-editor-initial-focus]",
          ) ?? editorRef.current;
    target?.focus();
  }, []);

  const requestClose = useCallback(() => {
    if (!dirty) {
      onClose();
      return;
    }
    confirmationReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setCloseConfirmationOpen(true);
  }, [dirty, onClose]);

  const continueEditing = useCallback(() => {
    const preferred = confirmationReturnFocusRef.current;
    setCloseConfirmationOpen(false);
    queueMicrotask(() => focusEditor(preferred));
  }, [focusEditor]);

  useEffect(() => {
    let mounted = true;
    const original = returnFocusRef.current;
    const fallback = fallbackFocusRef?.current ?? null;
    queueMicrotask(() => {
      if (mounted) focusEditor();
    });
    return () => {
      mounted = false;
      queueMicrotask(() => {
        const target =
          original?.isConnected === true
            ? original
            : fallback?.isConnected === true
              ? fallback
              : null;
        target?.focus();
      });
    };
  }, [fallbackFocusRef, focusEditor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const accelerator = event.ctrlKey || event.metaKey;
      if (accelerator && !event.altKey && event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (canSave) onSave();
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (closeConfirmationOpen) {
        continueEditing();
      } else {
        requestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canSave,
    closeConfirmationOpen,
    continueEditing,
    onSave,
    requestClose,
  ]);'''
panel_text, replacements = pattern.subn(replacement, panel_text, count=1)
if replacements != 1:
    raise SystemExit(f"Expected one hook block, replaced {replacements}")

panel_text = replace_once(
    panel_text,
    '''      aria-describedby={`${editorId}-status`}
      aria-labelledby={`${editorId}-title`}''',
    '''      aria-describedby={`${editorId}-status`}
      aria-label="Редактор координатной плоскости"''',
    "panel accessible name",
)
panel_path.write_text(panel_text, encoding="utf-8")
