import { describe, expect, it } from "vitest";

import { simplifyVectorInkSamples } from "../../../../src/modules/drawing/public";

describe("pressure-aware stroke simplification", () => {
  it("retains a pressure extremum on a straight segment", () => {
    const samples = [
      {
        point: { x: 0, y: 0 },
        pressure: 0.2,
        timestampMs: 0,
      },
      {
        point: { x: 50, y: 0 },
        pressure: 0.9,
        timestampMs: 8,
      },
      {
        point: { x: 100, y: 0 },
        pressure: 0.2,
        timestampMs: 16,
      },
    ] as const;

    const simplified = simplifyVectorInkSamples(samples, 0.1, 0.05);

    expect(simplified).toEqual(samples);
  });

  it("still removes geometrically and pressure-redundant samples", () => {
    const samples = Array.from({ length: 101 }, (_value, index) => ({
      point: { x: index, y: 0 },
      pressure: 0.5,
      timestampMs: index * 4,
    }));

    const simplified = simplifyVectorInkSamples(samples, 0.1, 0.05);

    expect(simplified).toEqual([samples[0], samples.at(-1)]);
  });

  it("uses timestamps when comparing pressure interpolation", () => {
    const samples = [
      {
        point: { x: 0, y: 0 },
        pressure: 0.2,
        timestampMs: 0,
      },
      {
        point: { x: 50, y: 0 },
        pressure: 0.8,
        timestampMs: 2,
      },
      {
        point: { x: 100, y: 0 },
        pressure: 0.8,
        timestampMs: 10,
      },
    ] as const;

    const simplified = simplifyVectorInkSamples(samples, 0.1, 0.05);

    expect(simplified).toEqual(samples);
  });

  it("validates both simplification tolerances", () => {
    const samples = [
      { point: { x: 0, y: 0 }, pressure: 0.5, timestampMs: 0 },
      { point: { x: 1, y: 1 }, pressure: 0.5, timestampMs: 1 },
      { point: { x: 2, y: 2 }, pressure: 0.5, timestampMs: 2 },
    ];

    expect(() => simplifyVectorInkSamples(samples, -1, 0.05)).toThrow(
      RangeError,
    );
    expect(() => simplifyVectorInkSamples(samples, 0.1, -1)).toThrow(
      RangeError,
    );
  });
});
