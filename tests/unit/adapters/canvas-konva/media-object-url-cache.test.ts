import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardMediaContentSource } from "../../../../src/core/public";
import { MediaObjectUrlCache } from "../../../../src/adapters/canvas-konva/media-object-url-cache";

function source(
  cacheKey: string,
  loadBlob: BoardMediaContentSource["loadBlob"],
): BoardMediaContentSource {
  return {
    cacheKey,
    contentSha256: "a".repeat(64),
    mimeType: "image/gif",
    url: "https://board.example.test/api/v1/boards/one/media/gif/content",
    loadBlob,
  };
}

describe("asset GIF object URL lifecycle", () => {
  const create = vi.fn(() => "blob:asset-gif");
  const revoke = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    create.mockClear();
    revoke.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("coalesces encoded fetch while multiple renderers retain it", async () => {
    const loadBlob = vi
      .fn()
      .mockResolvedValue(
        new Blob([new Uint8Array([71, 73, 70])], { type: "image/gif" }),
      );
    const cache = new MediaObjectUrlCache();
    const first = cache.acquire(source("board:one:asset:gif", loadBlob));
    const second = cache.acquire(source("board:one:asset:gif", loadBlob));
    expect(await first.promise).toBe("blob:asset-gif");
    expect(await second.promise).toBe("blob:asset-gif");
    expect(loadBlob).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(cache.snapshot()).toEqual({
      activeObjectUrls: 1,
      activeReferences: 2,
      entryCount: 1,
      pendingLoads: 0,
    });
    first.release();
    expect(revoke).not.toHaveBeenCalled();
    second.release();
    second.release();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:asset-gif");
    expect(cache.snapshot()).toEqual({
      activeObjectUrls: 0,
      activeReferences: 0,
      entryCount: 0,
      pendingLoads: 0,
    });
  });

  it("cancels in-flight reads when the last GIF is removed", async () => {
    let abort: AbortSignal | undefined;
    const loadBlob = vi.fn((signal?: AbortSignal) => {
      abort = signal;
      return new Promise<Blob>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("cancelled", "AbortError"));
        });
      });
    });
    const cache = new MediaObjectUrlCache();
    const first = cache.acquire(source("board:one:asset:pending", loadBlob));
    const second = cache.acquire(source("board:one:asset:pending", loadBlob));
    expect(cache.snapshot()).toMatchObject({
      pendingLoads: 1,
      activeReferences: 2,
    });
    first.release();
    expect(abort?.aborted).toBe(false);
    second.release();
    expect(abort?.aborted).toBe(true);
    await expect(first.promise).rejects.toThrow("cancelled");
    expect(create).not.toHaveBeenCalled();
  });

  it("does not share GIF URLs across access scopes", async () => {
    create.mockReturnValueOnce("blob:one").mockReturnValueOnce("blob:two");
    const loadBlob = vi.fn().mockResolvedValue(new Blob([new Uint8Array([1])]));
    const cache = new MediaObjectUrlCache();
    const oldContext = cache.acquire(source("scope:old", loadBlob));
    const newContext = cache.acquire(source("scope:new", loadBlob));
    expect(await oldContext.promise).toBe("blob:one");
    expect(await newContext.promise).toBe("blob:two");
    expect(loadBlob).toHaveBeenCalledTimes(2);
    oldContext.release();
    newContext.release();
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
