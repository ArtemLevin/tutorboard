const maximumCoalescedPointerEvents = 256;

function samePointerSample(left: PointerEvent, right: PointerEvent): boolean {
  return (
    left.pointerId === right.pointerId &&
    left.clientX === right.clientX &&
    left.clientY === right.clientY &&
    left.pressure === right.pressure &&
    left.timeStamp === right.timeStamp
  );
}

function pointerEventLike(value: unknown): value is PointerEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "pointerId" in value &&
    "clientX" in value &&
    "clientY" in value &&
    "pressure" in value &&
    "timeStamp" in value
  );
}

function appendUnique(output: PointerEvent[], event: PointerEvent): void {
  const previous = output.at(-1);
  if (previous === undefined || !samePointerSample(previous, event)) {
    output.push(event);
  }
}

/**
 * Returns the high-resolution hardware samples represented by one dispatched
 * pointer event. Browsers without getCoalescedEvents(), empty batches and
 * defensive runtime failures all fall back to the dispatched event itself.
 *
 * The final dispatched event is appended when the browser batch omits it, so
 * pointer-up coordinates and the most recent real sample are never lost.
 */
export function collectCoalescedPointerEvents(
  event: PointerEvent,
): readonly PointerEvent[] {
  const reader = event.getCoalescedEvents;
  if (typeof reader !== "function") return [event];

  let coalesced: readonly unknown[];
  try {
    const candidate = reader.call(event) as unknown;
    coalesced = Array.isArray(candidate) ? candidate : [];
  } catch {
    return [event];
  }

  const bounded = coalesced.slice(
    -Math.max(0, maximumCoalescedPointerEvents - 1),
  );
  const output: PointerEvent[] = [];
  for (const sample of bounded) {
    if (pointerEventLike(sample) && sample.pointerId === event.pointerId) {
      appendUnique(output, sample);
    }
  }
  appendUnique(output, event);
  return output.length === 0 ? [event] : output;
}

export { maximumCoalescedPointerEvents };
