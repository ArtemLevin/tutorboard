export const spotlightDefaults = {
  radiusPx: 170,
  dimPercent: 75,
} as const;

export const spotlightBounds = {
  minimumRadiusPx: 60,
  maximumRadiusPx: 320,
  minimumDimPercent: 30,
  maximumDimPercent: 90,
} as const;

export function normalizeSpotlightRadius(value: number): number {
  return Number.isFinite(value)
    ? Math.max(
        spotlightBounds.minimumRadiusPx,
        Math.min(spotlightBounds.maximumRadiusPx, Math.round(value)),
      )
    : spotlightDefaults.radiusPx;
}

export function normalizeSpotlightDim(value: number): number {
  return Number.isFinite(value)
    ? Math.max(
        spotlightBounds.minimumDimPercent,
        Math.min(spotlightBounds.maximumDimPercent, Math.round(value)),
      )
    : spotlightDefaults.dimPercent;
}
