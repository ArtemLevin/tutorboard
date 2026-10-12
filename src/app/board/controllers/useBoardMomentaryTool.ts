import { useEffect, useRef, useState } from "react";

import {
  eraserToolId,
  navigationToolId,
  type ActiveToolId,
} from "../active-tool";

type MomentaryKey = "Space" | "KeyX";

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    ((target instanceof HTMLElement && target.isContentEditable) ||
      target.closest(
        'button, a, input, textarea, select, [role="dialog"], [role="menu"]',
      ) !== null)
  );
}

/**
 * Space temporarily pans and Shift+X temporarily erases. Releasing the key
 * during an active pointer gesture defers restoring the selected tool until
 * the gesture finishes. Privilege changes and focus loss clear transient mode.
 */
export function useBoardMomentaryTool(
  selectedTool: ActiveToolId,
  disabled: boolean,
  readOnly: boolean,
): ActiveToolId {
  const [momentaryTool, setMomentaryTool] = useState<ActiveToolId | null>(null);
  const heldCodeRef = useRef<MomentaryKey | null>(null);
  const pointerIdsRef = useRef(new Set<number>());
  const releasePendingRef = useRef(false);

  useEffect(() => {
    const reset = () => {
      heldCodeRef.current = null;
      pointerIdsRef.current.clear();
      releasePendingRef.current = false;
      setMomentaryTool(null);
    };
    const release = () => {
      heldCodeRef.current = null;
      if (pointerIdsRef.current.size > 0) {
        releasePendingRef.current = true;
      } else {
        setMomentaryTool(null);
      }
    };
    const keydown = (event: KeyboardEvent) => {
      const tool =
        event.code === "Space"
          ? navigationToolId
          : event.code === "KeyX" && event.shiftKey
            ? eraserToolId
            : null;
      if (
        tool === null ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        disabled ||
        (tool === eraserToolId && readOnly) ||
        selectedTool === tool ||
        heldCodeRef.current !== null ||
        releasePendingRef.current ||
        isInteractiveTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      heldCodeRef.current = event.code as MomentaryKey;
      setMomentaryTool(tool);
    };
    const keyup = (event: KeyboardEvent) => {
      const keyReleased = heldCodeRef.current === event.code;
      const shiftReleased =
        heldCodeRef.current === "KeyX" &&
        (event.code === "ShiftLeft" || event.code === "ShiftRight") &&
        !event.shiftKey;
      if (!keyReleased && !shiftReleased) return;
      if (keyReleased) event.preventDefault();
      release();
    };
    const pointerdown = (event: PointerEvent) => {
      if (
        heldCodeRef.current !== null &&
        event.target instanceof Element &&
        event.target.closest('[data-testid="board-stage"]') !== null
      ) {
        pointerIdsRef.current.add(event.pointerId);
      }
    };
    const pointerend = (event: PointerEvent) => {
      pointerIdsRef.current.delete(event.pointerId);
      if (releasePendingRef.current && pointerIdsRef.current.size === 0) {
        releasePendingRef.current = false;
        setMomentaryTool(null);
      }
    };
    const visibilitychange = () => {
      if (document.hidden) reset();
    };

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("pointerdown", pointerdown);
    window.addEventListener("pointerup", pointerend);
    window.addEventListener("pointercancel", pointerend);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibilitychange);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("pointerdown", pointerdown);
      window.removeEventListener("pointerup", pointerend);
      window.removeEventListener("pointercancel", pointerend);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibilitychange);
    };
  }, [disabled, readOnly, selectedTool]);

  return momentaryTool === eraserToolId && readOnly
    ? selectedTool
    : (momentaryTool ?? selectedTool);
}
