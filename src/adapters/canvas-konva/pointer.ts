import type { Vec2 } from "../../core/public";

export function clientPoint(
  event: Pick<PointerEvent, "clientX" | "clientY">,
): Vec2 {
  return { x: event.clientX, y: event.clientY };
}

export function elementPoint(
  event: Pick<PointerEvent, "clientX" | "clientY">,
  element: Pick<HTMLElement, "getBoundingClientRect">,
): Vec2 {
  const bounds = element.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}
