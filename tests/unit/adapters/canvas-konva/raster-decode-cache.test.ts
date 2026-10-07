import { describe, expect, it, vi } from "vitest";

import {
  RasterDecodeCache,
  resolveRasterDecodeSize,
  type RasterBitmapResource,
  type RasterDecodeRequest,
} from "../../../../src/adapters/canvas-konva/raster-decode-cache";
import { RasterImageDiagnostics } from "../../../../src/adapters/canvas-konva/raster-image-diagnostics";

function resource(width: number, height: number) {
  const close = vi.fn();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const value: RasterBitmapResource = {
    close,
    height,
    image: canvas,
    width,
  };
  return { close, value };
}

describe("resolveRasterDecodeSize", () => {
  it("uses power-of-two display buckets and never exceeds intrinsic size", () => {
    const intrinsicSize = { height: 3_072, width: 4_096 };
    const displaySize = { height: 540, width: 720 };

    expect(
      resolveRasterDecodeSize({
        devicePixelRatio: 1,
        displaySize,
        intrinsicSize,
        objectScale: { x: 1, y: 1 },
        zoom: 1,
      }),
    ).toEqual({ height: 768, width: 1_024 });

    expect(
      resolveRasterDecodeSize({
        devicePixelRatio: 1,
        displaySize,
        intrinsicSize,
        objectScale: { x: 1, y: 1 },
        zoom: 0.5,
      }),
    ).toEqual({ height: 384, width: 512 });

    expect(
      resolveRasterDecodeSize({
        devicePixelRatio: 2,
        displaySize,
        intrinsicSize,
        objectScale: { x: 1, y: 1 },
        zoom: 2,
      }),
    ).toEqual(intrinsicSize);
  });
});

describe("RasterDecodeCache", () => {
  it("coalesces concurrent requests for the same content and bucket", async () => {
    const resolvers: Array<(value: RasterBitmapResource) => void> = [];
    const decoder = vi.fn(
      () =>
        new Promise<RasterBitmapResource>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const diagnostics = new RasterImageDiagnostics();
    const cache = new RasterDecodeCache({
      decoder,
      diagnostics,
      maxConcurrent: 2,
    });
    const request: RasterDecodeRequest = {
      contentSha256: "a".repeat(64),
      dataUrl: "data:image/png;base64,AA==",
      size: { height: 384, width: 512 },
    };

    const first = cache.acquire(request);
    const second = cache.acquire(request);

    expect(decoder).toHaveBeenCalledOnce();
    expect(cache.snapshot()).toMatchObject({
      activeDecodes: 1,
      entryCount: 1,
      queuedDecodes: 0,
    });

    const decoded = resource(512, 384);
    const resolveDecode = resolvers[0];
    if (resolveDecode === undefined) {
      throw new Error("Expected a pending raster decode.");
    }
    resolveDecode(decoded.value);
    await expect(first.promise).resolves.toMatchObject({
      height: 384,
      width: 512,
    });
    await expect(second.promise).resolves.toMatchObject({
      height: 384,
      width: 512,
    });
    expect(diagnostics.snapshot()).toMatchObject({
      activeDecodedCount: 1,
      decodeStartedCount: 1,
      duplicateDecodeStartCount: 0,
    });

    first.release();
    second.release();
    expect(decoded.close).not.toHaveBeenCalled();
  });

  it("does not coalesce different sources that claim the same content hash", async () => {
    const decoder = vi.fn(async (request: RasterDecodeRequest) => {
      const item = resource(
        request.dataUrl.endsWith("a") ? 64 : 128,
        request.dataUrl.endsWith("a") ? 64 : 128,
      );
      return item.value;
    });
    const cache = new RasterDecodeCache({
      decoder,
      diagnostics: new RasterImageDiagnostics(),
      maxConcurrent: 2,
    });
    const contentSha256 = "f".repeat(64);

    const first = cache.acquire({
      contentSha256,
      dataUrl: "data:image/png;base64,a",
      size: { height: 256, width: 256 },
    });
    const second = cache.acquire({
      contentSha256,
      dataUrl: "data:image/png;base64,b",
      size: { height: 256, width: 256 },
    });

    const [firstDecoded, secondDecoded] = await Promise.all([
      first.promise,
      second.promise,
    ]);

    expect(decoder).toHaveBeenCalledTimes(2);
    expect(firstDecoded.width).toBe(64);
    expect(secondDecoded.width).toBe(128);
    expect(cache.snapshot().entryCount).toBe(2);
    first.release();
    second.release();
  });

  it("bounds concurrent decodes", async () => {
    const resolvers: Array<(value: RasterBitmapResource) => void> = [];
    const decoder = vi.fn(
      () =>
        new Promise<RasterBitmapResource>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const cache = new RasterDecodeCache({
      decoder,
      diagnostics: new RasterImageDiagnostics(),
      maxConcurrent: 2,
    });

    const handles = ["a", "b", "c"].map((key) =>
      cache.acquire({
        contentSha256: key.repeat(64),
        dataUrl: `data:image/png;base64,${key}`,
        size: { height: 100, width: 100 },
      }),
    );

    expect(decoder).toHaveBeenCalledTimes(2);
    resolvers[0]?.(resource(100, 100).value);
    await handles[0]!.promise;
    await vi.waitFor(() => {
      expect(decoder).toHaveBeenCalledTimes(3);
    });

    resolvers[1]?.(resource(100, 100).value);
    resolvers[2]?.(resource(100, 100).value);
    await Promise.all(handles.map(({ promise }) => promise));
    for (const handle of handles) handle.release();
  });

  it("closes least-recently-used zero-ref bitmaps when over budget", async () => {
    const created: ReturnType<typeof resource>[] = [];
    const cache = new RasterDecodeCache({
      budgetBytes: 40_000,
      decoder: (request) => {
        const item = resource(request.size.width, request.size.height);
        created.push(item);
        return Promise.resolve(item.value);
      },
      diagnostics: new RasterImageDiagnostics(),
      maxConcurrent: 1,
    });

    const first = cache.acquire({
      contentSha256: "a".repeat(64),
      dataUrl: "data:image/png;base64,a",
      size: { height: 100, width: 100 },
    });
    await first.promise;
    first.release();

    const second = cache.acquire({
      contentSha256: "b".repeat(64),
      dataUrl: "data:image/png;base64,b",
      size: { height: 100, width: 100 },
    });
    await second.promise;

    expect(created[0]?.close).toHaveBeenCalledOnce();
    expect(created[1]?.close).not.toHaveBeenCalled();
    expect(cache.snapshot().totalBytes).toBe(40_000);

    second.release();
  });
});
