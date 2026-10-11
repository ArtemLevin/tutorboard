import { describe, expect, it, vi } from "vitest";

import {
  WheelHitLayerPause,
  type WheelHitLayer,
} from "../../../../src/adapters/canvas-konva/wheel-hit-layer-pause";

function layer(
  name: string,
  initialListening = true,
): {
  readonly node: WheelHitLayer;
  readonly listen: ReturnType<typeof vi.fn>;
  readonly hit: ReturnType<typeof vi.fn>;
  readonly state: () => boolean;
} {
  let enabled = initialListening;
  const listen = vi.fn((value: boolean) => {
    enabled = value;
  });
  const hit = vi.fn();
  function listening(): boolean;
  function listening(value: boolean): void;
  function listening(value?: boolean): boolean | void {
    if (value === undefined) return enabled;
    listen(value);
  }
  const node: WheelHitLayer = {
    name: () => name,
    listening,
    drawHit: hit,
  };
  return { node, listen, hit, state: () => enabled };
}

describe("C3.9-S7 transient hit-layer suppression", () => {
  it("temporarily skips committed layers but leaves overlays untouched", () => {
    const coordinator = new WheelHitLayerPause();
    const staticLayer = layer("static-content-layer");
    const animatedLayer = layer("animated-content-layer");
    const overlay = layer("unnamed-layer");

    coordinator.begin([overlay.node, staticLayer.node, animatedLayer.node]);
    expect(coordinator.active).toBe(true);
    expect(coordinator.suspendedCount).toBe(2);
    expect(staticLayer.state()).toBe(false);
    expect(animatedLayer.state()).toBe(false);
    expect(overlay.state()).toBe(true);
    expect(overlay.hit).not.toHaveBeenCalled();

    coordinator.restore();
    expect(coordinator.active).toBe(false);
    expect(coordinator.suspendedCount).toBe(0);
    expect(coordinator.restoreCount).toBe(1);
    expect(staticLayer.state()).toBe(true);
    expect(animatedLayer.state()).toBe(true);
    expect(staticLayer.hit).toHaveBeenCalledOnce();
    expect(animatedLayer.hit).toHaveBeenCalledOnce();
    expect(overlay.hit).not.toHaveBeenCalled();
  });

  it("restores current hit geometry on pointer movement, cancel, and dispose exactly once", () => {
    const coordinator = new WheelHitLayerPause();
    const staticLayer = layer("static-content-layer");
    coordinator.begin([staticLayer.node]);
    coordinator.restore(); // native pointer capture, before Konva hit testing
    coordinator.restore(); // wheel commit after pointer capture
    coordinator.dispose(); // unmount
    expect(staticLayer.hit).toHaveBeenCalledOnce();
    expect(coordinator.restoreCount).toBe(1);
    expect(staticLayer.state()).toBe(true);
    coordinator.begin([staticLayer.node]);
    coordinator.dispose();
    // An unmount must never paint into an already detached Konva canvas.
    expect(staticLayer.hit).toHaveBeenCalledOnce();
    expect(staticLayer.state()).toBe(true);
  });

  it("does not activate originally non-listening layers or corrupt their state", () => {
    const coordinator = new WheelHitLayerPause();
    const readonlyLayer = layer("static-content-layer", false);
    coordinator.begin([readonlyLayer.node]);
    coordinator.restore();
    expect(readonlyLayer.state()).toBe(false);
    expect(readonlyLayer.hit).not.toHaveBeenCalled();
    expect(readonlyLayer.listen).not.toHaveBeenCalled();
  });

  it("tracks virtualized replacements and restores detached layers", () => {
    const coordinator = new WheelHitLayerPause();
    const first = layer("static-content-layer");
    const next = layer("static-content-layer");
    coordinator.begin([first.node]);
    coordinator.sync([next.node]);
    expect(first.state()).toBe(true);
    expect(next.state()).toBe(false);
    expect(first.hit).not.toHaveBeenCalled();
    coordinator.restore();
    expect(next.state()).toBe(true);
    expect(next.hit).toHaveBeenCalledOnce();
    expect(first.hit).not.toHaveBeenCalled();
  });

  it("prevents stale duplicate layer registrations across wheel inputs", () => {
    const coordinator = new WheelHitLayerPause();
    const ink = layer("static-content-layer");
    coordinator.begin([ink.node]);
    coordinator.begin([ink.node]);
    coordinator.sync([ink.node]);
    expect(ink.listen).toHaveBeenCalledTimes(1);
    coordinator.restore();
    expect(ink.listen).toHaveBeenCalledTimes(2);
    expect(ink.hit).toHaveBeenCalledOnce();
  });
});
