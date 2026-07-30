import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  parseSmartInkCorpus,
  recognizeSmartInkStroke,
} from "../../../../src/modules/smart-ink-spike/public.ts";
import { extractHdsDominantContour } from "../../../../scripts/lib/hds-contour.mjs";

const execFileAsync = promisify(execFile);

function rectanglePng() {
  const image = new PNG({ height: 70, width: 70 });
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const onStroke =
        ((x >= 14 && x <= 16) || (x >= 53 && x <= 55)) && y >= 18 && y <= 51
          ? true
          : ((y >= 18 && y <= 20) || (y >= 49 && y <= 51)) &&
            x >= 14 &&
            x <= 55;
      const value = onStroke ? 25 : 255;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  return image;
}

describe("Phase 9 HDS contour adapter", () => {
  it("imports a bounded raster with anonymized group provenance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tutorboard-hds-"));
    try {
      const root = join(directory, "data");
      const imageDirectory = join(root, "user.test", "images", "rectangle");
      const vertexDirectory = join(root, "user.test", "vertices", "rectangle");
      await mkdir(imageDirectory, { recursive: true });
      await mkdir(vertexDirectory, { recursive: true });
      await writeFile(
        join(imageDirectory, "rectangle.test.0001.png"),
        PNG.sync.write(rectanglePng()),
      );
      await writeFile(
        join(vertexDirectory, "rectangle.test.0001.csv"),
        "0.2,0.25\n0.8,0.25\n0.8,0.75\n0.2,0.75\n",
        "utf8",
      );
      const output = join(directory, "hds.json");

      await execFileAsync(
        process.execPath,
        [
          "scripts/import-hds-corpus.mjs",
          "--root",
          root,
          "--max-per-kind",
          "1",
          "--seed",
          "123",
          "--output",
          output,
        ],
        { cwd: process.cwd() },
      );
      const corpus = parseSmartInkCorpus(
        JSON.parse(await readFile(output, "utf8")),
      );

      expect(corpus.samples).toHaveLength(1);
      expect(corpus.samples[0]).toMatchObject({
        acceptableKinds: ["rectangle", "square"],
        expectedKind: "rectangle",
        metadata: {
          browser: "other",
          deviceProfile: "other-device",
          durationMs: 0,
          pointerType: "unknown",
          sourceDataset: "hds",
          sourceGroupId: expect.stringMatching(/^hds-group-[a-f0-9]{20}$/),
          traceOrigin: "raster-contour",
        },
        provenance: "external-human",
        shouldPropose: true,
      });
      expect(corpus.samples[0].id).not.toContain("user.test");
      expect(corpus.samples[0].points).toHaveLength(128);
      expect(
        recognizeSmartInkStroke(corpus.samples[0].id, corpus.samples[0].points)
          .candidates[0]?.kind,
      ).toBe("rectangle");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects blank and fragmented rasters", () => {
    const blank = new Uint8Array(20 * 20 * 4);
    blank.fill(255);

    expect(() =>
      extractHdsDominantContour({
        data: blank,
        height: 20,
        width: 20,
      }),
    ).toThrow("insufficient foreground contrast");

    const fragmented = new Uint8Array(blank);
    for (const [minimumX, minimumY] of [
      [2, 2],
      [13, 13],
    ]) {
      for (let y = minimumY; y < minimumY + 4; y += 1) {
        for (let x = minimumX; x < minimumX + 4; x += 1) {
          const offset = (y * 20 + x) * 4;
          fragmented[offset] = 0;
          fragmented[offset + 1] = 0;
          fragmented[offset + 2] = 0;
        }
      }
    }
    expect(() =>
      extractHdsDominantContour({
        data: fragmented,
        height: 20,
        width: 20,
      }),
    ).toThrow("no sufficiently dominant component");
  });
});
