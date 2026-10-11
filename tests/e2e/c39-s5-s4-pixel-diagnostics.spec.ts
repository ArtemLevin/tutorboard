import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const konvaUmd = await readFile(
  resolve(dirname(require.resolve("konva")), "../konva.min.js"),
  "utf8",
);

interface RasterDiff {
  readonly count: number;
  readonly maxDelta: number;
  readonly firstPixels: readonly { readonly x: number; readonly y: number; readonly baseline: readonly number[]; readonly cached: readonly number[] }[];
}

interface ProbeResult {
  readonly name: string;
  readonly dpr: number;
  readonly opacity: number;
  readonly cropOrigin: number;
  readonly pathOffset: number;
  readonly cache: RasterDiff;
  readonly restored: RasterDiff;
  readonly hitBefore: readonly (string | null)[];
  readonly hitAfter: readonly (string | null)[];
}

test("@c39-s5-pixel-diagnostic isolates native Path cache, alpha, DPR and crop origin", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.addScriptTag({ content: konvaUmd });
  const evidence: readonly ProbeResult[] = await page.evaluate(() => {
    type KType = typeof import("konva")["default"];
    const Konva = (window as unknown as { Konva: KType }).Konva;

    function compare(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number): RasterDiff {
      if (a.length !== b.length) throw new Error("Canvas dimensions differ");
      let count = 0;
      let maxDelta = 0;
      const firstPixels: { x: number; y: number; baseline: number[]; cached: number[] }[] = [];
      for (let i = 0; i < a.length; i += 4) {
        const delta = Math.max(...[0, 1, 2, 3].map((offset) => Math.abs(a[i + offset]! - b[i + offset]!)));
        if (delta === 0) continue;
        count++;
        maxDelta = Math.max(delta, maxDelta);
        if (firstPixels.length < 16) {
          firstPixels.push({
            x: (i / 4) % width,
            y: Math.floor(i / (width * 4)),
            baseline: Array.from(a.slice(i, i + 4)),
            cached: Array.from(b.slice(i, i + 4)),
          });
        }
      }
      return { count, maxDelta, firstPixels };
    }

    const cases = [
      { name: "opaque-aligned-dpr1", dpr: 1, opacity: 1, cropOrigin: 0, pathOffset: 0 },
      { name: "alpha-aligned-dpr1", dpr: 1, opacity: 0.65, cropOrigin: 0, pathOffset: 0 },
      { name: "alpha-aligned-dpr2", dpr: 2, opacity: 0.65, cropOrigin: 0, pathOffset: 0 },
      { name: "opaque-aligned-dpr2", dpr: 2, opacity: 1, cropOrigin: 0, pathOffset: 0 },
      { name: "alpha-fractional-path-dpr2", dpr: 2, opacity: 0.65, cropOrigin: 0, pathOffset: 0.375 },
      { name: "alpha-fractional-crop-dpr2", dpr: 2, opacity: 0.65, cropOrigin: 0.5, pathOffset: 0.375 },
      { name: "opaque-fractional-crop-dpr2", dpr: 2, opacity: 1, cropOrigin: 0.5, pathOffset: 0.375 },
    ] as const;
    return cases.map((scenario) => {
      const host = document.createElement("div");
      document.body.append(host);
      const stage = new Konva.Stage({ container: host, width: 160, height: 100 });
      const layer = new Konva.Layer();
      const group = new Konva.Group();
      const fillPath = new Konva.Path({
        id: "diagnostic-pen",
        data: "M 15.3 36.2 C 28.6 26.7 48.2 24.8 67.9 31.4 C 89.1 44.2 121.7 56.3 134.8 49.2 L 133.4 53.8 C 112.3 62.6 87.2 47.8 68.2 36.8 C 48.6 30.1 28.9 31.2 15.3 42.7 Z",
        fill: "#17202a",
        opacity: scenario.opacity,
        x: scenario.pathOffset,
        y: scenario.pathOffset,
        perfectDrawEnabled: true,
      });
      const underPath = new Konva.Path({
        id: "diagnostic-under",
        data: "M 23 55 C 42 44 58 32 88 35 L 92 40 C 57 39 43 50 23 61 Z",
        fill: "#c13b26",
        opacity: scenario.opacity,
        perfectDrawEnabled: true,
      });
      stage.add(layer);
      layer.add(group);
      group.add(underPath, fillPath);
      try {
        const sample = () => {
          layer.draw();
          const canvas = stage.toCanvas({ pixelRatio: scenario.dpr });
          const ctx = canvas.getContext("2d");
          if (ctx === null) throw new Error("No context");
          return ctx.getImageData(0, 0, canvas.width, canvas.height);
        };
        const hit = () =>
          [{x:35,y:37}, {x:82,y:38}, {x:8,y:8}]
            .map((point) => stage.getIntersection(point)?.id() ?? null);
        const baseline = sample();
        const hitBefore = hit();
        group.cache({
          x: scenario.cropOrigin,
          y: scenario.cropOrigin,
          width: 157,
          height: 97,
          pixelRatio: scenario.dpr,
          hitCanvasPixelRatio: 1,
        });
        const cached = sample();
        const hitAfter = hit();
        group.clearCache();
        const restored = sample();
        return {
          ...scenario,
          cache: compare(baseline.data, cached.data, baseline.width),
          restored: compare(baseline.data, restored.data, baseline.width),
          hitBefore,
          hitAfter,
        };
      } finally {
        stage.destroy();
        host.remove();
      }
    });
  });
  console.info("C39_S5_S4_MINIMAL_PROBE " + JSON.stringify(evidence));
  await testInfo.attach("c39-s5-s4-native-path-cache.json", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
  expect(evidence).toHaveLength(7);
  for (const result of evidence) {
    expect(result.hitAfter, result.name).toEqual(result.hitBefore);
    expect(result.restored.count, result.name).toBe(0);
  }
});
