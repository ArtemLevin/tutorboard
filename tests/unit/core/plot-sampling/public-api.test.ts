import { describe, expect, it } from "vitest";

import {
  coordinatePlotSamplerVersion,
  createPlotSamplingCache,
  sampleCoordinatePlotDefinition,
  sampleExplicitSeries,
  sampleParametricSeries,
} from "../../../../src/core/public";

describe("coordinate plot sampler public API", () => {
  it("is exported through the stable core boundary", () => {
    expect(coordinatePlotSamplerVersion).toBe("tutorboard-sampler/2");
    expect(typeof createPlotSamplingCache).toBe("function");
    expect(typeof sampleCoordinatePlotDefinition).toBe("function");
    expect(typeof sampleExplicitSeries).toBe("function");
    expect(typeof sampleParametricSeries).toBe("function");
  });
});
