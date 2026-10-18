import { describe, expect, it } from "vitest";

import {
  normalizeSpotlightDim,
  normalizeSpotlightRadius,
  spotlightBounds,
  spotlightDefaults,
} from "./spotlight-settings";

describe("spotlight presentation settings", () => {
  it("keeps radius and dim within bounded ergonomic ranges", () => {
    expect(normalizeSpotlightRadius(190.6)).toBe(191);
    const minimum = normalizeSpotlightRadius(1);
    expect(minimum).toBe(spotlightBounds.minimumRadiusPx);
    const maximum = normalizeSpotlightRadius(1000);
    expect(maximum).toBe(spotlightBounds.maximumRadiusPx);
    expect(normalizeSpotlightDim(68.9)).toBe(69);
    const minimumDim = normalizeSpotlightDim(-100);
    expect(minimumDim).toBe(spotlightBounds.minimumDimPercent);
    const maximumDim = normalizeSpotlightDim(100);
    expect(maximumDim).toBe(spotlightBounds.maximumDimPercent);
  });

  it("substitutes safe defaults for invalid input", () => {
    const invalidRadius = normalizeSpotlightRadius(Number.NaN);
    const invalidDim = normalizeSpotlightDim(Number.POSITIVE_INFINITY);
    expect(invalidRadius).toBe(spotlightDefaults.radiusPx);
    expect(invalidDim).toBe(spotlightDefaults.dimPercent);
  });
});
