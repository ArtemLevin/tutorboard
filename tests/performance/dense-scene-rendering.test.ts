import { cleanup, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardSceneContent } from "../../src/adapters/canvas-konva/board-scene-content";
import { createDefaultKonvaRendererRegistry } from "../../src/adapters/canvas-konva/public";
import {
  boardObjectId,
  createVectorInkData,
  type BoardRenderItem,
} from "../../src/core/public";

vi.mock("react-konva", () => {
  const group = ({ children }: { readonly children?: ReactNode }) =>
    createElement("div", null, children);
  const shape = () => null;
  return {
    Circle: shape,
    Ellipse: shape,
    Group: group,
    Image: shape,
    Layer: group,
    Line: shape,
    Path: shape,
    Rect: shape,
    Stage: group,
    Text: shape,
    Transformer: shape,
  };
});

afterEach(cleanup);

function median(values: readonly number[]) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ]!;
}

describe("dense committed scene performance", () => {
  it("reuses 500 real pen render paths through transient updates", () => {
    const samples = Array.from({ length: 32 }, (_, index) => ({
      point: { x: index * 2, y: Math.sin(index / 3) * 10 },
      pressure: 0.5,
      timestampMs: index * 8,
    }));
    const ink = createVectorInkData(samples);
    const items: BoardRenderItem[] = Array.from(
      { length: 500 },
      (_, index) => ({
        object: {
          groupId: null,
          id: boardObjectId(`object:render-performance:${index}`),
          ink,
          kind: "drawing.pen-stroke",
          locked: false,
          points: samples.map(({ point }) => point),
          position: { x: index % 100, y: Math.floor(index / 100) },
          rotation: 0,
          scale: { x: 1, y: 1 },
          source: { kind: "user" },
          style: { fill: null, opacity: 1, stroke: "#17202a", strokeWidth: 2 },
          visible: true,
        },
        transforms: [],
      }),
    );
    const registry = createDefaultKonvaRendererRegistry();
    // Reproduce the original BoardStage render-time mapping using the real
    // registry. These CPU timings exclude canvas painting in both directions.
    const mappingMs: number[] = [];
    for (let pass = 0; pass < 7; pass += 1) {
      const started = performance.now();
      for (const item of items) registry.render(item, { zoom: 1 });
      if (pass >= 2) mappingMs.push(performance.now() - started);
    }
    const calls = vi.spyOn(registry, "render");
    const props = {
      batches: [items],
      lineEndpointPreview: null,
      registry,
      selectedObjectIds: [],
      selectionPreviewX: 0,
      selectionPreviewY: 0,
      zoom: 1,
    };
    const view = render(createElement(BoardSceneContent, props));
    const updateMs: number[] = [];
    for (let pass = 0; pass < 7; pass += 1) {
      const started = performance.now();
      view.rerender(createElement(BoardSceneContent, { ...props }));
      if (pass >= 2) updateMs.push(performance.now() - started);
    }
    expect(calls).toHaveBeenCalledTimes(500);
    // Exact render-count reuse is the primary gate. 250 ms provides broad CI
    // headroom over the sub-millisecond local update samples.
    expect(median(updateMs)).toBeLessThan(250);
    console.info(
      "DENSE_SCENE_CPU_PROFILE",
      JSON.stringify({
        objectCount: 500,
        samples: 5,
        mappingMedianMs: median(mappingMs),
        transientUpdateMedianMs: median(updateMs),
        mappingMs,
        updateMs,
      }),
    );
  });
});
