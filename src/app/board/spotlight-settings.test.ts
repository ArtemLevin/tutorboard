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
    expect(normalizeSpotlightRadius(1000)).toBe(
      spotlightBounds.maximumRadiusPx,
    );
    expect(normalizeSpotlightDim(68.9)).toBe(69);
    expect(normalizeSpotlightDim(-100)).toBe(
      spotlightBounds.minimumDimPercent,
    );
    expect(normalizeSpotlightDim(100)).toBe(
      spotlightBounds.maximumDimPercent,
    );
  });

  it("substitutes safe defaults for invalid input", () => {
    expect(normalizeSpotlightRadius(Number.NaN)).toBe(
      spotlightDefaults.radiusPx,
    );
    expect(normalizeSpotlightDim(Number.POSITIVE_INFINITY)).toBe(
      spotlightDefaults.dimPercent,
    );
  });
});
