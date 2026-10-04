import { afterEach, describe, expect, it } from "vitest";

import {
  coordinatePlotSamplingCache,
  coordinatePlotSamplingCacheSize,
  clearCoordinatePlotSamplingCache,
} from "../../../../src/adapters/canvas-konva/coordinate-plot-cache";
import { createCoordinatePlotRenderModel } from "../../../../src/adapters/canvas-konva/public";
import { createCoordinatePlotProductionObject } from "../../../fixtures/coordinate-plot-production";

describe("coordinate plot renderer cache lifecycle", () => {
  afterEach(() => clearCoordinatePlotSamplingCache());

  it("drops sampled series when board resources are cleared", () => {
    createCoordinatePlotRenderModel({
      cache: coordinatePlotSamplingCache,
      object: createCoordinatePlotProductionObject(0),
      zoom: 1,
    });

    expect(coordinatePlotSamplingCacheSize()).toBeGreaterThan(0);
    clearCoordinatePlotSamplingCache();
    expect(coordinatePlotSamplingCacheSize()).toBe(0);
  });

  it("stays empty after repeated fill and clear cycles", () => {
    for (let index = 0; index < 8; index += 1) {
      createCoordinatePlotRenderModel({
        cache: coordinatePlotSamplingCache,
        object: createCoordinatePlotProductionObject(index),
        zoom: 1 + index / 10,
      });
      expect(coordinatePlotSamplingCacheSize()).toBeGreaterThan(0);
      clearCoordinatePlotSamplingCache();
      expect(coordinatePlotSamplingCacheSize()).toBe(0);
    }
  });
});
