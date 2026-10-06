import { describe, expect, it } from "vitest";

import { RasterImageDiagnostics } from "../../../../src/adapters/canvas-konva/raster-image-diagnostics";

describe("RasterImageDiagnostics", () => {
  it("tracks decoded byte estimates, peaks, duplicates and release", () => {
    const diagnostics = new RasterImageDiagnostics();

    const first = diagnostics.begin("a".repeat(64), 10);
    diagnostics.complete(first, 6_000, 4_000, 35);

    const second = diagnostics.begin("a".repeat(64), 40);
    diagnostics.complete(second, 6_000, 4_000, 65);

    expect(diagnostics.snapshot()).toMatchObject({
      activeDecodedCount: 2,
      activeEstimatedDecodedBytes: 192_000_000,
      decodeCompletedCount: 2,
      decodeFailedCount: 0,
      decodeStartedCount: 2,
      duplicateDecodeStartCount: 1,
      lastDecodeMs: 25,
      maxDecodeMs: 25,
      peakActiveDecodedCount: 2,
      peakEstimatedDecodedBytes: 192_000_000,
      releasedCount: 0,
    });

    diagnostics.release(first);
    expect(diagnostics.snapshot()).toMatchObject({
      activeDecodedCount: 1,
      activeEstimatedDecodedBytes: 96_000_000,
      releasedCount: 1,
    });

    diagnostics.release(second);
    expect(diagnostics.snapshot()).toMatchObject({
      activeDecodedCount: 0,
      activeEstimatedDecodedBytes: 0,
      releasedCount: 2,
    });
  });

  it("does not count failed decode memory as active", () => {
    const diagnostics = new RasterImageDiagnostics();
    const session = diagnostics.begin("b".repeat(64), 100);

    diagnostics.fail(session);

    expect(diagnostics.snapshot()).toMatchObject({
      activeDecodedCount: 0,
      activeEstimatedDecodedBytes: 0,
      decodeFailedCount: 1,
      decodeStartedCount: 1,
    });
  });

  it("publishes an initial snapshot and each lifecycle transition", () => {
    const diagnostics = new RasterImageDiagnostics();
    const snapshots: number[] = [];
    const unsubscribe = diagnostics.subscribe(({ decodeStartedCount }) => {
      snapshots.push(decodeStartedCount);
    });

    const session = diagnostics.begin("c".repeat(64), 0);
    diagnostics.complete(session, 100, 100, 1);
    diagnostics.release(session);
    unsubscribe();
    diagnostics.begin("d".repeat(64), 2);

    expect(snapshots).toEqual([0, 1, 1, 1]);
  });
});
