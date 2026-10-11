import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const konvaBundle = await readFile(
  resolve(dirname(require.resolve("konva/package.json")), "konva.min.js"),
  "utf8",
);

test("@c39-s5-s1 one bounded pen-run cache preserves pen-image-pen pixels, original hit identities and Transformer ownership", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.addScriptTag({ content: konvaBundle });
  const evidence = await page.evaluate(async () => {
    type KonvaRuntime = typeof import("konva")["default"];
    const K = (window as Window & { Konva: KonvaRuntime }).Konva;
    const host = document.createElement("div");
    document.body.append(host);
    const stage = new K.Stage({ container: host, width: 260, height: 130 });
    const layer = new K.Layer();
    stage.add(layer);
    try {
      const cachedRun = new K.Group({ id: "pen-run-before" });
      const red = new K.Line({
        id: "pen-red", name: "board-object", points: [20, 58, 132, 58],
        stroke: "#e1262f", strokeWidth: 10, opacity: 0.65, lineCap: "round",
      });
      const amber = new K.Line({
        id: "pen-amber", name: "board-object", points: [20, 68, 132, 68],
        stroke: "#f4a20c", strokeWidth: 8, opacity: 0.45, lineCap: "round",
      });
      cachedRun.add(red, amber);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 2;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("Missing PNG context");
      context.fillStyle = "#1b55eb";
      context.fillRect(0, 0, 2, 2);
      const png = new Image();
      const loaded = new Promise<void>((resolveLoad, rejectLoad) => {
        png.onload = () => resolveLoad();
        png.onerror = () => rejectLoad(new Error("PNG decode failed"));
      });
      png.src = canvas.toDataURL("image/png");
      await loaded;
      const raster = new K.Image({
        id: "raster-png", name: "board-object", image: png,
        x: 65, y: 46, width: 55, height: 41, opacity: 0.85,
      });
      const followingRun = new K.Group({ id: "pen-run-after" });
      const green = new K.Line({
        id: "pen-green", name: "board-object", points: [42, 58, 155, 58],
        stroke: "#25c24d", strokeWidth: 6, opacity: 0.75, lineCap: "round",
      });
      followingRun.add(green);
      layer.add(cachedRun, raster, followingRun);
      const points = [
        { x: 30, y: 58 }, { x: 30, y: 68 }, { x: 82, y: 78 },
        { x: 82, y: 58 }, { x: 148, y: 58 }, { x: 5, y: 5 },
      ];
      const sample = () => {
        const context = stage.toCanvas({ pixelRatio: 1 }).getContext("2d");
        if (context === null) throw new Error("Missing sample context");
        return {
          pixels: points.map(({ x, y }) =>
            Array.from(context.getImageData(x, y, 1, 1).data)),
          hits: points.map((point) => stage.getIntersection(point)?.id() ?? null),
        };
      };
      layer.draw();
      const baseline = sample();
      cachedRun.cache({
        x: 8, y: 39, width: 147, height: 51,
        pixelRatio: 1, hitCanvasPixelRatio: 1,
      });
      layer.draw();
      const cached = sample();
      const originalOwnership =
        stage.getIntersection({ x: 30, y: 58 }) === red &&
        stage.getIntersection({ x: 82, y: 58 }) === green &&
        stage.getIntersection({ x: 82, y: 78 }) === raster &&
        stage.find(".board-object").length === 4;
      const transformer = new K.Transformer({ nodes: [red] });
      layer.add(transformer);
      layer.draw();
      const transformerOriginal = transformer.nodes()[0] === red;
      transformer.destroy();
      cachedRun.clearCache();
      layer.draw();
      const restored = sample();
      const pixelDifference = (a: number[][], b: number[][]) =>
        Math.max(...a.flatMap((pixel, i) =>
          pixel.map((value, channel) => Math.abs(value - b[i]![channel]!))));
      return {
        version: K.version,
        baseline, cached, restored,
        cachedPixelDifference: pixelDifference(baseline.pixels, cached.pixels),
        restoredPixelDifference: pixelDifference(baseline.pixels, restored.pixels),
        originalOwnership, transformerOriginal,
        orderedNodes: layer.getChildren().map((node) => node.id()),
      };
    } finally {
      stage.destroy();
      host.remove();
    }
  });
  expect(evidence.version).toBe("10.3.0");
  expect(evidence.baseline.hits).toEqual([
    "pen-red", "pen-amber", "raster-png", "pen-green", "pen-green", null,
  ]);
  expect(evidence.cached.hits).toEqual(evidence.baseline.hits);
  expect(evidence.restored.hits).toEqual(evidence.baseline.hits);
  expect(evidence.cachedPixelDifference).toBeLessThanOrEqual(3);
  expect(evidence.restoredPixelDifference).toBe(0);
  expect(evidence.originalOwnership).toBe(true);
  expect(evidence.transformerOriginal).toBe(true);
  expect(evidence.orderedNodes).toEqual([
    "pen-run-before", "raster-png", "pen-run-after",
  ]);
  await testInfo.attach("c39-s5-s1-bounded-run.json", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
});

test("@c39-s5-s1 a crop hides the crossing stroke outside its bounds; clearCache recovers hit identity", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.addScriptTag({ content: konvaBundle });
  const evidence = await page.evaluate(() => {
    type KonvaRuntime = typeof import("konva")["default"];
    const K = (window as Window & { Konva: KonvaRuntime }).Konva;
    const host = document.createElement("div");
    document.body.append(host);
    const stage = new K.Stage({ container: host, width: 320, height: 140 });
    const layer = new K.Layer();
    const group = new K.Group();
    const pen = new K.Line({
      id: "crossing-stroke", points: [16, 75, 286, 75],
      stroke: "#b122ae", strokeWidth: 12, lineCap: "round",
    });
    stage.add(layer);
    layer.add(group);
    group.add(pen);
    const hit = (x: number) => stage.getIntersection({ x, y: 75 }) === pen;
    try {
      layer.draw();
      const baseline = [hit(38), hit(246)];
      group.cache({
        x: 0, y: 48, width: 120, height: 54,
        pixelRatio: 1, hitCanvasPixelRatio: 1,
      });
      layer.draw();
      const leftCrop = [hit(38), hit(246)];
      group.clearCache();
      layer.draw();
      const restored = [hit(38), hit(246)];
      group.cache({
        x: 160, y: 48, width: 150, height: 54,
        pixelRatio: 1, hitCanvasPixelRatio: 1,
      });
      layer.draw();
      const rightCrop = [hit(38), hit(246)];
      group.clearCache();
      layer.draw();
      return {
        baseline, leftCrop, restored, rightCrop,
        finalHit: [hit(38), hit(246)],
        nodeCount: stage.find("#crossing-stroke").length,
      };
    } finally {
      stage.destroy();
      host.remove();
    }
  });
  expect(evidence.baseline).toEqual([true, true]);
  expect(evidence.leftCrop).toEqual([true, false]);
  expect(evidence.restored).toEqual([true, true]);
  expect(evidence.rightCrop).toEqual([false, true]);
  expect(evidence.finalHit).toEqual([true, true]);
  expect(evidence.nodeCount).toBe(1);
  await testInfo.attach("c39-s5-s1-crossing-crop.json", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
});

test("@c39-s5-s1 invalidation restores the same node across move, undo and redo visual transformations", async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ content: konvaBundle });
  const evidence = await page.evaluate(() => {
    type KonvaRuntime = typeof import("konva")["default"];
    const K = (window as Window & { Konva: KonvaRuntime }).Konva;
    const host = document.createElement("div");
    document.body.append(host);
    const stage = new K.Stage({ container: host, width: 230, height: 120 });
    const layer = new K.Layer();
    const group = new K.Group();
    const pen = new K.Line({
      id: "movable-pen", points: [15, 45, 75, 45],
      stroke: "#225599", strokeWidth: 10, lineCap: "round",
    });
    stage.add(layer);
    layer.add(group);
    group.add(pen);
    const hit = (x: number) => stage.getIntersection({ x, y: 45 }) === pen;
    try {
      layer.draw();
      const baseline = [hit(25), hit(110)];
      group.cache({
        x: 5, y: 30, width: 85, height: 30,
        pixelRatio: 1, hitCanvasPixelRatio: 1,
      });
      layer.draw();
      const cached = [hit(25), hit(110)];
      group.clearCache();
      pen.x(80);
      layer.draw();
      const moved = [hit(25), hit(110)];
      pen.x(0);
      layer.draw();
      const undone = [hit(25), hit(110)];
      pen.x(80);
      layer.draw();
      const redone = [hit(25), hit(110)];
      return {
        baseline, cached, moved, undone, redone,
        nodeCount: stage.find("#movable-pen").length,
      };
    } finally {
      stage.destroy();
      host.remove();
    }
  });
  expect(evidence).toEqual({
    baseline: [true, false], cached: [true, false],
    moved: [false, true], undone: [true, false],
    redone: [false, true], nodeCount: 1,
  });
});
