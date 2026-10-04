export type TextEditorKeyboardAction =
  "cancel" | "commit" | "compose" | "native";

export interface TextEditorKeyboardEventLike {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly isComposing: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export function resolveTextEditorKeyboardAction(
  event: TextEditorKeyboardEventLike,
): TextEditorKeyboardAction {
  if (event.isComposing) return "compose";
  if (event.key === "Escape") return "cancel";
  if (
    event.key === "Enter" &&
    !event.altKey &&
    (event.shiftKey || event.ctrlKey || event.metaKey)
  ) {
    return "commit";
  }
  return "native";
}
