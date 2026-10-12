import { useEffect, useRef, useState } from "react";

import type { ActiveToolId } from "../active-tool";
import { navigationToolId } from "../active-tool";

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      'button, a, input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]',
    ) !== null
  );
}

/**
 * Space temporarily switches canvas gestures to pan without changing the
 * selected tool. If Space is released mid-drag, retain pan until pointerup
 * so the viewport gesture commits before the previous tool is restored.
 */
export function useBoardMomentaryPan(
  selectedTool: ActiveToolId,
  disabled: boolean,
): ActiveToolId {
  const [momentary, setMomentary] = useState(false);
  const heldRef = useRef(false);
  const pointerIdsRef = useRef(new Set<number>());
  const releasePendingRef = useRef(false);

  useEffect(() => {
    const reset = () => {
      heldRef.current = false;
      pointerIdsRef.current.clear();
      releasePendingRef.current = false;
      setMomentary(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        disabled ||
        selectedTool === navigationToolId ||
        heldRef.current ||
        releasePendingRef.current ||
        isInteractiveTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      heldRef.current = true;
      setMomentary(true);
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !heldRef.current) return;
      event.preventDefault();
      heldRef.current = false;
      if (pointerIdsRef.current.size > 0) {
        releasePendingRef.current = true;
      } else {
        setMomentary(false);
      }
    };
    const pointerdown = (event: PointerEvent) => {
      if (
        heldRef.current &&
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
        setMomentary(false);
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
  }, [disabled, selectedTool]);

  return momentary ? navigationToolId : selectedTool;
}
