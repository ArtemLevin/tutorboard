import {
  useCallback,
  useRef,
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import { resolveTextEditorKeyboardAction } from "../../modules/text-editing/public";

export interface TextEditorKeyboardSessionOptions {
  readonly onCancel: (target: HTMLTextAreaElement) => void;
  readonly onCommit: (value: string) => void;
}

export function useTextEditorKeyboardSession({
  onCancel,
  onCommit,
}: TextEditorKeyboardSessionOptions) {
  const composingRef = useRef(false);
  const cancelBlurRef = useRef(false);
  const pendingBlurCommitRef = useRef(false);

  const onFocus = useCallback(() => {
    cancelBlurRef.current = false;
    pendingBlurCommitRef.current = false;
  }, []);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback(
    (event: CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = false;
      if (!pendingBlurCommitRef.current || cancelBlurRef.current) return;
      pendingBlurCommitRef.current = false;
      onCommit(event.currentTarget.value);
    },
    [onCommit],
  );

  const onBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      if (cancelBlurRef.current) {
        cancelBlurRef.current = false;
        pendingBlurCommitRef.current = false;
        return;
      }
      if (composingRef.current) {
        pendingBlurCommitRef.current = true;
        return;
      }
      onCommit(event.currentTarget.value);
    },
    [onCommit],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const action = resolveTextEditorKeyboardAction({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        isComposing:
          composingRef.current || event.nativeEvent.isComposing === true,
        key: event.key,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });

      if (action === "compose") {
        event.stopPropagation();
        return;
      }
      if (action === "native") return;

      event.preventDefault();
      event.stopPropagation();
      if (action === "cancel") {
        cancelBlurRef.current = true;
        pendingBlurCommitRef.current = false;
        onCancel(event.currentTarget);
      }
      event.currentTarget.blur();
    },
    [onCancel],
  );

  return {
    onBlur,
    onCompositionEnd,
    onCompositionStart,
    onFocus,
    onKeyDown,
  } as const;
}
