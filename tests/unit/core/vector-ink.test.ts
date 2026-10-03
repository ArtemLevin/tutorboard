import { describe, expect, it } from "vitest";

import {
  createLinearVectorInkDataFromPoints,
  createVectorInkData,
  createVectorInkDataFromPoints,
  defaultVectorInkPressure,
  vectorInkCenterlinePathData,
  vectorInkDataMatchesPoints,
  vectorInkOutlinePathData,
} from "../../../src/core/public";

function closedOutlineSubpaths(path: string) {
  return [...path.matchAll(/M ([^Z]+) Z/gu)].map((match) =>
    [...match[0].matchAll(/[ML] (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/gu)].map(
      (point) => ({
        x: Number(point[1]),
        y: Number(point[2]),
      }),
    ),
  );
}

function signedArea(
  points: readonly { readonly x: number; readonly y: number }[],
) {
  return (
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

describe("Vector Ink 1.0", () => {
  it("creates a deterministic cubic centerline for legacy points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 10 },
      { x: 40, y: 0 },
    ];
    const ink = createVectorInkDataFromPoints(points);
    expect(ink.version).toBe("1.0");
    expect(ink.samples).toHaveLength(points.length);
    expect(
      ink.samples.every(
        ({ pressure }) => pressure === defaultVectorInkPressure,
      ),
    ).toBe(true);
    expect(ink.centerline).toHaveLength(2);
    expect(vectorInkDataMatchesPoints(ink, points)).toBe(true);
    expect(vectorInkCenterlinePathData(ink)).toMatch(/^M .* C .* C /u);
  });

  it("renders a collapsed two-sample stroke as a visible dot", () => {
    const point = { x: 12, y: 18 };
    const ink = createVectorInkData([
      { point, pressure: 0.4, timestampMs: 0 },
      { point, pressure: 0.8, timestampMs: 1 },
    ]);
    expect(ink.centerline).toHaveLength(1);
    expect(vectorInkDataMatchesPoints(ink, [point, point])).toBe(true);
    const outline = vectorInkOutlinePathData(ink, 10);
    expect(outline).toContain("A ");
    expect(outline.endsWith("Z")).toBe(true);
    expect(outline).not.toContain("NaN");
  });

  it("turns pressure into a bounded variable-width outline", () => {
    const ink = createVectorInkData([
      { point: { x: 0, y: 0 }, pressure: 0.1, timestampMs: 0 },
      { point: { x: 40, y: 10 }, pressure: 0.55, timestampMs: 8 },
      { point: { x: 80, y: 0 }, pressure: 1, timestampMs: 16 },
    ]);
    const outline = vectorInkOutlinePathData(ink, 10);
    expect(outline).toMatch(/^M /u);
    expect(outline.endsWith("Z")).toBe(true);
    expect(outline).not.toContain("NaN");
    expect(outline).not.toContain("Infinity");
  });

  it("keeps open outlines on the existing single-subpath cap contract", () => {
    const ink = createVectorInkData([
      { point: { x: 0, y: 0 }, pressure: 0.2, timestampMs: 0 },
      { point: { x: 80, y: 20 }, pressure: 0.8, timestampMs: 8 },
      { point: { x: 160, y: 0 }, pressure: 0.4, timestampMs: 16 },
    ]);

    const outline = vectorInkOutlinePathData(ink, 10);

    expect(outline.match(/M /gu) ?? []).toHaveLength(1);
    expect(outline.match(/Z/gu) ?? []).toHaveLength(1);
    expect(outline).toContain("L ");
  });

  it("preserves a closed centerline", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 15, y: 25 },
      { x: 0, y: 0 },
    ];
    const ink = createVectorInkDataFromPoints(points);
    expect(ink.closed).toBe(true);
    expect(ink.centerline).toHaveLength(3);
    expect(vectorInkCenterlinePathData(ink).endsWith("Z")).toBe(true);
    expect(vectorInkDataMatchesPoints(ink, points)).toBe(true);
  });

  it("renders a closed variable-width triangle as two opposite-winding boundaries", () => {
    const ink = createVectorInkData(
      [
        { point: { x: 0, y: 0 }, pressure: 0.2, timestampMs: 0 },
        { point: { x: 200, y: 0 }, pressure: 0.95, timestampMs: 8 },
        { point: { x: 100, y: 160 }, pressure: 0.45, timestampMs: 16 },
        { point: { x: 0, y: 0 }, pressure: 0.2, timestampMs: 24 },
      ],
      true,
    );

    const outline = vectorInkOutlinePathData(ink, 18);
    const boundaries = closedOutlineSubpaths(outline);

    expect(boundaries).toHaveLength(2);
    expect(outline.match(/M /gu) ?? []).toHaveLength(2);
    expect(outline.match(/Z/gu) ?? []).toHaveLength(2);
    expect(outline).not.toContain("NaN");
    expect(outline).not.toContain("Infinity");
    expect(boundaries.every((boundary) => boundary.length >= 3)).toBe(true);
    expect(
      signedArea(boundaries[0]!) * signedArea(boundaries[1]!),
    ).toBeLessThan(0);
  });

  it.each([
    [
      "counter-clockwise",
      [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
        { x: 80, y: 120 },
        { x: 0, y: 0 },
      ],
    ],
    [
      "clockwise",
      [
        { x: 0, y: 0 },
        { x: 80, y: 120 },
        { x: 160, y: 0 },
        { x: 0, y: 0 },
      ],
    ],
  ] as const)("keeps %s closed outlines seam-free", (_label, points) => {
    const ink = createVectorInkData(
      points.map((point, index) => ({
        point,
        pressure: [0.25, 0.9, 0.55, 0.25][index]!,
        timestampMs: index * 8,
      })),
      true,
    );

    const outline = vectorInkOutlinePathData(ink, 12);
    const boundaries = closedOutlineSubpaths(outline);

    expect(boundaries).toHaveLength(2);
    expect(
      signedArea(boundaries[0]!) * signedArea(boundaries[1]!),
    ).toBeLessThan(0);
  });

  it("keeps sharp closed linear polygons finite for thin and thick strokes", () => {
    const ink = createLinearVectorInkDataFromPoints([
      { x: 0, y: 0 },
      { x: 140, y: 0 },
      { x: 140, y: 80 },
      { x: 0, y: 80 },
      { x: 0, y: 0 },
    ]);

    for (const width of [0.5, 24]) {
      const outline = vectorInkOutlinePathData(ink, width);
      expect(closedOutlineSubpaths(outline)).toHaveLength(2);
      expect(outline).not.toContain("NaN");
      expect(outline).not.toContain("Infinity");
    }
  });

  it("keeps a variable-pressure freehand closed contour seam-free", () => {
    const samples = [
      { point: { x: 10, y: 20 }, pressure: 0.25, timestampMs: 0 },
      { point: { x: 90, y: -10 }, pressure: 0.65, timestampMs: 8 },
      { point: { x: 170, y: 45 }, pressure: 0.9, timestampMs: 16 },
      { point: { x: 135, y: 125 }, pressure: 0.5, timestampMs: 24 },
      { point: { x: 45, y: 115 }, pressure: 0.75, timestampMs: 32 },
      { point: { x: 10, y: 20 }, pressure: 0.25, timestampMs: 40 },
    ] as const;
    const ink = createVectorInkData(samples, true);

    const outline = vectorInkOutlinePathData(ink, 14);
    const boundaries = closedOutlineSubpaths(outline);

    expect(boundaries).toHaveLength(2);
    expect(
      signedArea(boundaries[0]!) * signedArea(boundaries[1]!),
    ).toBeLessThan(0);
    expect(outline).not.toContain("NaN");
    expect(outline).not.toContain("Infinity");
  });

  it("creates canonical straight segments for a closed polygon", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 45, y: 72 },
      { x: 0, y: 0 },
    ];
    const ink = createLinearVectorInkDataFromPoints(points);
    expect(ink.closed).toBe(true);
    expect(ink.centerline).toHaveLength(3);
    expect(vectorInkDataMatchesPoints(ink, points)).toBe(true);
    for (const segment of ink.centerline) {
      const delta = {
        x: segment.end.x - segment.start.x,
        y: segment.end.y - segment.start.y,
      };
      for (const control of [segment.control1, segment.control2]) {
        const relative = {
          x: control.x - segment.start.x,
          y: control.y - segment.start.y,
        };
        expect(delta.x * relative.y - delta.y * relative.x).toBeCloseTo(0);
      }
    }
  });
});
