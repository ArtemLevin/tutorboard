import { useEffect, useRef, type RefObject } from "react";

interface SpotlightOverlayProps {
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly radiusPx: number;
  readonly dimPercent: number;
}

/**
 * A presentation-only DOM overlay. Move the radial mask via CSS variables so
 * pointer movement never schedules a Konva scene render or document command.
 */
export function SpotlightOverlay({
  rootRef,
  radiusPx,
  dimPercent,
}: SpotlightOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const overlay = overlayRef.current;
    if (root === null || overlay === null) return;

    let frame: number | null = null;
    let latest: { readonly x: number; readonly y: number } | null = null;
    const paint = () => {
      frame = null;
      if (latest === null) return;
      const rect = root.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, latest.x - rect.left));
      const y = Math.max(0, Math.min(rect.height, latest.y - rect.top));
      overlay.style.setProperty("--spotlight-x", `${x}px`);
      overlay.style.setProperty("--spotlight-y", `${y}px`);
    };
    const move = (event: PointerEvent) => {
      latest = { x: event.clientX, y: event.clientY };
      if (frame === null) frame = window.requestAnimationFrame(paint);
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerdown", move);
    return () => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", move);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [rootRef]);

  return (
    <div
      aria-hidden="true"
      className="board-spotlight-overlay"
      data-spotlight-dim={dimPercent}
      data-spotlight-radius={radiusPx}
      data-testid="board-spotlight-overlay"
      ref={overlayRef}
      style={{
        backgroundImage: `radial-gradient(circle ${radiusPx}px at var(--spotlight-x, 50%) var(--spotlight-y, 50%), transparent 0%, transparent 68%, rgba(10, 16, 28, ${dimPercent / 100}) 100%)`,
      }}
    />
  );
}
