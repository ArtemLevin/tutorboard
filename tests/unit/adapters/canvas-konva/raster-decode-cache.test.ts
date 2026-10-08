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
      activeReferences: 2,
      entryCount: 1,
      pendingEntries: 1,
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
    expect(cache.snapshot()).toMatchObject({
      activeReferences: 0,
      retainedEntryCount: 1,
      retainedBytes: 512 * 384 * 4,
      pendingEntries: 0,
    });
    expect(decoded.close).not.toHaveBeenCalled();
  });

  it("does not coalesce different sources that claim the same content hash", async () => {
    const decoder = vi.fn((request: RasterDecodeRequest) => {
      const item = resource(
        request.dataUrl?.endsWith("a") ? 64 : 128,
        request.dataUrl?.endsWith("a") ? 64 : 128,
      );
      return Promise.resolve(item.value);
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

  it("trims ready zero-ref resources below the memory budget", async () => {
    const decoded = resource(100, 100);
    const diagnostics = new RasterImageDiagnostics();
    const cache = new RasterDecodeCache({
      budgetBytes: 1_000_000,
      decoder: () => Promise.resolve(decoded.value),
      diagnostics,
    });

    const handle = cache.acquire({
      contentSha256: "t".repeat(64),
      dataUrl: "data:image/png;base64,t",
      size: { height: 100, width: 100 },
    });
    await handle.promise;
    handle.release();

    expect(cache.snapshot().totalBytes).toBe(40_000);
    cache.trimUnused();

    expect(decoded.close).toHaveBeenCalledOnce();
    expect(cache.snapshot()).toMatchObject({
      entryCount: 0,
      totalBytes: 0,
    });
    expect(diagnostics.snapshot().activeEstimatedDecodedBytes).toBe(0);
  });

  it("discards an in-flight zero-ref decode after trim", async () => {
    const resolvers: Array<(value: RasterBitmapResource) => void> = [];
    const decoded = resource(100, 100);
    const cache = new RasterDecodeCache({
      decoder: () =>
        new Promise<RasterBitmapResource>((resolve) => {
          resolvers.push(resolve);
        }),
      diagnostics: new RasterImageDiagnostics(),
    });

    const handle = cache.acquire({
      contentSha256: "u".repeat(64),
      dataUrl: "data:image/png;base64,u",
      size: { height: 100, width: 100 },
    });
    handle.release();
    cache.trimUnused();

    const resolve = resolvers[0];
    if (resolve === undefined) {
      throw new Error("Expected pending raster decode.");
    }
    resolve(decoded.value);
    await handle.promise;

    await vi.waitFor(() => {
      expect(decoded.close).toHaveBeenCalledOnce();
      expect(cache.snapshot().entryCount).toBe(0);
      expect(cache.snapshot().totalBytes).toBe(0);
    });
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

describe("asset-backed A2 raster source", () => {
  const sha = "a".repeat(64);
  const makeSource = (
    cacheKey: string,
    loadBlob: (signal?: AbortSignal) => Promise<Blob>,
  ) => ({
    cacheKey,
    contentSha256: sha,
    mimeType: "image/png" as const,
    url: "https://board.example.test/api/v1/boards/one/media/asset/content",
    loadBlob,
  });

  it("decodes fetched asset Blobs with the A2 bitmap decoder", async () => {
    const close = vi.fn();
    const createBitmap = vi.fn().mockResolvedValue({
      close,
      height: 64,
      width: 64,
    });
    vi.stubGlobal("createImageBitmap", createBitmap);
    try {
      const loadBlob = vi
        .fn()
        .mockResolvedValue(
          new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
        );
      const cache = new RasterDecodeCache({
        diagnostics: new RasterImageDiagnostics(),
      });
      const handle = cache.acquire({
        contentSha256: sha,
        source: makeSource("scope:default-decoder", loadBlob),
        size: { width: 64, height: 64 },
      });
      await expect(handle.promise).resolves.toMatchObject({
        width: 64,
        height: 64,
      });
      expect(loadBlob).toHaveBeenCalledOnce();
      expect(createBitmap).toHaveBeenCalledWith(expect.any(Blob), {
        resizeHeight: 64,
        resizeQuality: "high",
        resizeWidth: 64,
      });
      handle.release();
      cache.trimUnused();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects authorization errors without HTML fallback", async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createBitmap);
    const unauthorized = new Error("403 forbidden");
    const loadBlob = vi.fn().mockRejectedValue(unauthorized);
    try {
      const cache = new RasterDecodeCache({
        diagnostics: new RasterImageDiagnostics(),
      });
      const handle = cache.acquire({
        contentSha256: sha,
        source: makeSource("scope:unauthorized", loadBlob),
        size: { width: 64, height: 64 },
      });
      await expect(handle.promise).rejects.toThrow("403 forbidden");
      expect(createBitmap).not.toHaveBeenCalled();
      handle.release();
      expect(cache.snapshot().entryCount).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("coalesces equivalent scoped asset requests in one bucket", async () => {
    const decoded = resource(128, 128);
    const decoder = vi.fn(() => Promise.resolve(decoded.value));
    const cache = new RasterDecodeCache({
      decoder,
      diagnostics: new RasterImageDiagnostics(),
    });
    const source = makeSource("session:one:asset:a", vi.fn());
    const request = {
      contentSha256: sha,
      source,
      size: { width: 128, height: 128 },
    };
    const first = cache.acquire(request);
    const second = cache.acquire({ ...request, source: { ...source } });
    await Promise.all([first.promise, second.promise]);
    expect(decoder).toHaveBeenCalledTimes(1);
    expect(cache.snapshot()).toMatchObject({
      entryCount: 1,
      totalBytes: 65536,
    });
    first.release();
    second.release();
    cache.trimUnused();
    expect(decoded.close).toHaveBeenCalledOnce();
  });

  it("separates identical checksums across boards and access scopes", async () => {
    const decoder = vi.fn((request: RasterDecodeRequest) =>
      Promise.resolve(resource(request.size.width, request.size.height).value),
    );
    const cache = new RasterDecodeCache({
      decoder,
      diagnostics: new RasterImageDiagnostics(),
    });
    const request = (scope: string) => ({
      contentSha256: sha,
      source: makeSource(scope, vi.fn()),
      size: { width: 64, height: 64 },
    });
    const a = cache.acquire(request("session:one:asset"));
    const b = cache.acquire(request("session:two:asset"));
    await Promise.all([a.promise, b.promise]);
    expect(decoder).toHaveBeenCalledTimes(2);
    expect(cache.snapshot().entryCount).toBe(2);
    a.release();
    b.release();
    cache.trimUnused();
    expect(cache.snapshot().totalBytes).toBe(0);
  });

  it("cancels unused asset decodes but keeps a shared in-flight consumer", () => {
    const signals: AbortSignal[] = [];
    const decoder = vi.fn(
      (_request: RasterDecodeRequest, abort: AbortSignal) => {
        signals.push(abort);
        return new Promise<RasterBitmapResource>(() => undefined);
      },
    );
    const cache = new RasterDecodeCache({
      decoder,
      diagnostics: new RasterImageDiagnostics(),
    });
    const request = {
      contentSha256: sha,
      source: makeSource("session:one", vi.fn()),
      size: { width: 64, height: 64 },
    };
    const first = cache.acquire(request);
    const second = cache.acquire(request);
    first.promise.catch(() => undefined);
    second.promise.catch(() => undefined);
    first.release();
    expect(signals[0]?.aborted).toBe(false);
    second.release();
    expect(signals[0]?.aborted).toBe(true);
    expect(cache.snapshot().entryCount).toBe(0);
  });

  it("closes a late decoded bitmap after cache clear", async () => {
    let resolveDecode: ((value: RasterBitmapResource) => void) | undefined;
    const cache = new RasterDecodeCache({
      decoder: () =>
        new Promise((resolve) => {
          resolveDecode = resolve;
        }),
      diagnostics: new RasterImageDiagnostics(),
    });
    const handle = cache.acquire({
      contentSha256: sha,
      source: makeSource("session:late", vi.fn()),
      size: { width: 64, height: 64 },
    });
    handle.promise.catch(() => undefined);
    cache.clear();
    const decoded = resource(64, 64);
    resolveDecode?.(decoded.value);
    await vi.waitFor(() => expect(decoded.close).toHaveBeenCalledOnce());
    expect(cache.snapshot()).toMatchObject({ entryCount: 0, totalBytes: 0 });
    handle.release();
  });

  it("preserves bounded source concurrency", async () => {
    const resolves: Array<(resource: RasterBitmapResource) => void> = [];
    const decoder = vi.fn(
      () =>
        new Promise<RasterBitmapResource>((resolve) => {
          resolves.push(resolve);
        }),
    );
    const cache = new RasterDecodeCache({
      decoder,
      diagnostics: new RasterImageDiagnostics(),
      maxConcurrent: 2,
    });
    const handles = ["one", "two", "three"].map((scope) =>
      cache.acquire({
        contentSha256: sha,
        source: makeSource(scope, vi.fn()),
        size: { width: 64, height: 64 },
      }),
    );
    expect(decoder).toHaveBeenCalledTimes(2);
    resolves[0]?.(resource(64, 64).value);
    await handles[0]!.promise;
    await vi.waitFor(() => expect(decoder).toHaveBeenCalledTimes(3));
    resolves[1]?.(resource(64, 64).value);
    resolves[2]?.(resource(64, 64).value);
    await Promise.all(handles.map((item) => item.promise));
    for (const handle of handles) handle.release();
  });
});

describe("F3.3.2-B raster resource ownership", () => {
  const request = (identity: string): RasterDecodeRequest => ({
    contentSha256: "a".repeat(64),
    source: {
      cacheKey: identity,
      contentSha256: "a".repeat(64),
      mimeType: "image/png",
      url: "https://board.example.test/assets",
      loadBlob: () => Promise.resolve(new Blob()),
    },
    size: { height: 100, width: 100 },
  });

  it("removes cancelled queued tasks while continuing the remaining queue", async () => {
    const pending: Array<(value: RasterBitmapResource) => void> = [];
    const decoder = vi.fn(
      () =>
        new Promise<RasterBitmapResource>((resolve) => {
          pending.push(resolve);
        }),
    );
    const cache = new RasterDecodeCache({
      decoder,
      diagnostics: new RasterImageDiagnostics(),
      maxConcurrent: 1,
    });
    const a = cache.acquire(request("a"));
    const b = cache.acquire(request("b"));
    const c = cache.acquire(request("c"));
    expect(cache.snapshot()).toMatchObject({
      activeDecodes: 1,
      queuedDecodes: 2,
    });
    b.release();
    await expect(b.promise).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.snapshot()).toMatchObject({
      queuedDecodes: 1,
      entryCount: 2,
    });
    pending[0]?.(resource(100, 100).value);
    await a.promise;
    await vi.waitFor(() => expect(decoder).toHaveBeenCalledTimes(2));
    pending[1]?.(resource(100, 100).value);
    await c.promise;
    a.release();
    c.release();
    cache.trimUnused();
    expect(cache.snapshot()).toMatchObject({ totalBytes: 0, entryCount: 0 });
  });

  it("budgets in-flight reservations and permits an oversized single decode", async () => {
    const pending: Array<(value: RasterBitmapResource) => void> = [];
    const cache = new RasterDecodeCache({
      decoder: () =>
        new Promise<RasterBitmapResource>((resolve) => {
          pending.push(resolve);
        }),
      diagnostics: new RasterImageDiagnostics(),
      maxConcurrent: 2,
      maxInFlightBytes: 40_000,
    });
    const a = cache.acquire(request("a"));
    const b = cache.acquire(request("b"));
    expect(cache.snapshot()).toMatchObject({
      activeDecodes: 1,
      queuedDecodes: 1,
      inFlightReservedBytes: 40_000,
    });
    pending[0]?.(resource(100, 100).value);
    await a.promise;
    await vi.waitFor(() =>
      expect(cache.snapshot()).toMatchObject({
        activeDecodes: 1,
        queuedDecodes: 0,
        inFlightReservedBytes: 40_000,
      }),
    );
    pending[1]?.(resource(100, 100).value);
    await b.promise;
    a.release();
    b.release();
    cache.trimUnused();
    await vi.waitFor(() =>
      expect(cache.snapshot()).toMatchObject({
        inFlightReservedBytes: 0,
        totalBytes: 0,
        entryCount: 0,
      }),
    );
    const oversized = cache.acquire({
      ...request("large"),
      size: { width: 200, height: 200 },
    });
    expect(cache.snapshot().inFlightReservedBytes).toBe(160_000);
    pending[2]?.(resource(200, 200).value);
    await oversized.promise;
    oversized.release();
    cache.trimUnused();
    expect(cache.snapshot().totalBytes).toBe(0);
  });

  it("closes an exact source only after its last reference", async () => {
    const made = new Map<string, ReturnType<typeof resource>>();
    const cache = new RasterDecodeCache({
      decoder: (input) => {
        const key = input.source?.cacheKey ?? "";
        const bitmap = resource(64, 64);
        made.set(key, bitmap);
        return Promise.resolve(bitmap.value);
      },
      diagnostics: new RasterImageDiagnostics(),
    });
    const one = cache.acquire(request("scope:A"));
    const two = cache.acquire(request("scope:A"));
    const foreign = cache.acquire(request("scope:B"));
    await Promise.all([one.promise, two.promise, foreign.promise]);
    cache.discardSourceWhenUnused("scope:A");
    one.release();
    expect(made.get("scope:A")?.close).not.toHaveBeenCalled();
    two.release();
    expect(made.get("scope:A")?.close).toHaveBeenCalledOnce();
    expect(made.get("scope:B")?.close).not.toHaveBeenCalled();
    expect(cache.snapshot()).toMatchObject({
      entryCount: 1,
      activeReferences: 1,
    });
    foreign.release();
    cache.discardSourceWhenUnused("scope:B");
    expect(made.get("scope:B")?.close).toHaveBeenCalledOnce();
    expect(cache.snapshot()).toMatchObject({ entryCount: 0, totalBytes: 0 });
  });

  it("closes late source-targeted decode results exactly once", async () => {
    let finish!: (value: RasterBitmapResource) => void;
    const cache = new RasterDecodeCache({
      decoder: () =>
        new Promise<RasterBitmapResource>((resolve) => {
          finish = resolve;
        }),
      diagnostics: new RasterImageDiagnostics(),
    });
    const handle = cache.acquire(request("scope:late"));
    cache.discardSourceWhenUnused("scope:late");
    handle.release();
    await expect(handle.promise).rejects.toMatchObject({ name: "AbortError" });
    const bitmap = resource(64, 64);
    finish(bitmap.value);
    await vi.waitFor(() => expect(bitmap.close).toHaveBeenCalledOnce());
    expect(cache.snapshot()).toMatchObject({ entryCount: 0, totalBytes: 0 });
  });
});
