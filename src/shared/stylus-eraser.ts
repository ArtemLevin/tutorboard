/**
 * Optional pen-only gesture override. Only an actual pen secondary/eraser
 * switch can activate it; mouse right-click and touch never erase.
 * Pointer Events specify button=2 for barrel and button=5 for eraser tip.
 */
export interface StylusPointerButtons {
  readonly pointerType: string;
  readonly button: number;
  readonly buttons: number;
}

export function startsStylusEraser(
  event: StylusPointerButtons,
  enabled: boolean,
  activeTool: string | null,
): boolean {
  if (!enabled || activeTool !== "drawing.pen" || event.pointerType !== "pen")
    return false;
  return (
    event.button === 2 ||
    event.button === 5 ||
    (event.buttons & (2 | 32)) !== 0
  );
}

/** A captured eraser gesture owns its pointer until completion or cancellation. */
export interface StylusEraserGesture {
  readonly pointerId: number;
}

export function transitionStylusEraserGesture(
  current: StylusEraserGesture | null,
  event:
    | { readonly kind: "start"; readonly pointerId: number; readonly enabled: boolean }
    | { readonly kind: "end" | "cancel" | "lostcapture"; readonly pointerId: number }
    | { readonly kind: "blur" | "disable" | "unmount" },
): StylusEraserGesture | null {
  if (event.kind === "start")
    return current === null && event.enabled ? { pointerId: event.pointerId } : current;
  if (event.kind === "blur" || event.kind === "disable" || event.kind === "unmount")
    return null;
  return current?.pointerId === event.pointerId ? null : current;
}
