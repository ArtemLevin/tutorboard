import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const konvaBundle = await readFile(
  resolve(dirname(require.resolve("konva")), "../konva.min.js"),
  "utf8",
);

test("@c39-s5-subpixel isolate DPR, alpha, and integer crop with one Konva stroke", async ({
  page,
}) => {
  await page.goto("/");
  await page.addScriptTag({ content: konvaBundle });
  const samples = await page.evaluate(() => {
    type Runtime = (typeof import("konva"))["default"];
    const Konva = (window as unknown as { Konva: Runtime }).Konva;
    const output: {
      dpr: number;
      opacity: number;
      fractional: boolean;
      cropShift: number;
      changedPixels: number;
      maxDelta: number;
      baselineHits: string[];
      cachedHits: string[];
    }[] = [];
    for (const dpr of [1, 2]) {
      Konva.pixelRatio = dpr;
      for (const opacity of [1, 0.5]) {
        for (const fractional of [false, true]) {
          for (const cropShift of [0, 0.5]) {
            const holder = document.createElement("div");
            document.body.append(holder);
            const stage = new Konva.Stage({
              container: holder,
              width: 220,
              height: 140,
            });
            const layer = new Konva.Layer();
            const group = new Konva.Group();
            const stroke = new Konva.Line({
              id: "canonical-pen",
              stroke: "#2355b6",
              strokeWidth: 4,
              lineCap: "round",
              opacity,
              points: [24 + (fractional ? 0.5 : 0), 21, 173, 108],
            });
            stage.add(layer);
            layer.add(group);
            group.add(stroke);
            group.add(new Konva.Line({
              id: "crossing-pen",
              points: [35, 108, 166, 21],
              stroke: "#d2533b",
              strokeWidth: 3,
              lineCap: "round",
              opacity,
            }));
            const hit = () => [
              stage.getIntersection({ x: 25, y: 21 })?.id() ?? "",
              stage.getIntersection({ x: 105, y: 68 })?.id() ?? "",
            ];
            layer.draw();
            const before = stage.toCanvas({ pixelRatio: dpr });
            const beforeData = before
              .getContext("2d", { willReadFrequently: true })!
              .getImageData(0, 0, before.width, before.height).data;
            const baselineHits = hit();
            group.cache({
              x: 13 + cropShift,
              y: 9 + cropShift,
              width: 175,
              height: 113,
              pixelRatio: dpr,
              hitCanvasPixelRatio: 1,
            });
            layer.draw();
            const cachedHits = hit();
            const after = stage.toCanvas({ pixelRatio: dpr });
            const afterData = after
              .getContext("2d", { willReadFrequently: true })!
              .getImageData(0, 0, after.width, after.height).data;
            let changedPixels = 0;
            let maxDelta = 0;
            for (let i = 0; i < beforeData.length; i += 4) {
              let delta = 0;
              for (let channel = 0; channel < 4; channel += 1) {
                delta = Math.max(
                  delta,
                  Math.abs(beforeData[i + channel]! - afterData[i + channel]!),
                );
              }
              if (delta > 0) changedPixels += 1;
              maxDelta = Math.max(maxDelta, delta);
            }
            output.push({
              dpr,
              opacity,
              fractional,
              cropShift,
              changedPixels,
              maxDelta,
              baselineHits,
              cachedHits,
            });
            stage.destroy();
            holder.remove();
          }
        }
      }
    }
    return output;
  });
  console.info("C39_S5_S4_SUBPIXEL " + JSON.stringify(samples));
  expect(samples).toHaveLength(16);
  for (const item of samples) {
    expect(item.cachedHits).toEqual(item.baselineHits);
  }
});
