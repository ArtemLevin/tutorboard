import type { Vec2 } from "../../core/public";

export function clientPoint(
  event: Pick<PointerEvent, "clientX" | "clientY">,
): Vec2 {
  return { x: event.clientX, y: event.clientY };
}
