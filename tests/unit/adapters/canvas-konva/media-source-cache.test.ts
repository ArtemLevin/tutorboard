import { describe, expect, it } from "vitest";

import { MediaSourceCache } from "../../../../src/adapters/canvas-konva/media-source-cache";
import {
  boardObjectId,
  type BoardMediaContentSource,
  type MediaAssetObject,
} from "../../../../src/core/public";

function asset(id: string, sha = "a".repeat(64)): MediaAssetObject {
  return {
    assetId: id,
    byteSize: 10,
    contentSha256: sha,
    fileName: "media.png",
    groupId: null,
    id: boardObjectId("media:" + id),
    intrinsicSize: { height: 10, width: 10 },
    kind: "media.asset",
    locked: false,
    mimeType: "image/png",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { height: 10, width: 10 },
    source: { kind: "user" },
    style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
    visible: true,
  };
}

function resolve(object: MediaAssetObject): BoardMediaContentSource {
  return {
    cacheKey: "scope:" + object.assetId + ":" + object.contentSha256,
    contentSha256: object.contentSha256,
    mimeType: object.mimeType,
    url: "https://board.example.test/assets",
    loadBlob: () => Promise.resolve(new Blob()),
  };
}

describe("MediaSourceCache", () => {
  it("bounds retained source descriptors and evicts the least recently used", () => {
    const cache = new MediaSourceCache(2);
    const a = asset("a");
    const b = asset("b");
    const c = asset("c");
    const first = cache.resolve(a, resolve);
    const firstB = cache.resolve(b, resolve);
    expect(cache.resolve(a, resolve)).toBe(first);
    cache.resolve(c, resolve);
    expect(cache.snapshot()).toEqual({ entryCount: 2, maxEntries: 2 });
    expect(cache.resolve(a, resolve)).toBe(first);
    expect(cache.resolve(b, resolve)).not.toBe(firstB);
    expect(cache.snapshot().entryCount).toBe(2);
  });

  it("prunes removed assets and replaces sources on content or access change", () => {
    const cache = new MediaSourceCache();
    const original = asset("one");
    const first = cache.resolve(original, resolve);
    const changed = cache.resolve(asset("one", "b".repeat(64)), resolve);
    expect(changed).not.toBe(first);
    expect(
      cache.resolve({ ...original, mimeType: "image/gif" }, resolve),
    ).not.toBe(first);
    const newAccess = cache.resolve(original, (item) => ({
      ...resolve(item),
      cacheKey: "next-access-epoch:" + item.assetId,
    }));
    expect(newAccess).not.toBe(first);
    cache.resolve(asset("two"), resolve);
    cache.retain(new Set(["one"]));
    expect(cache.snapshot().entryCount).toBe(1);
    expect(cache.drainRetiredSourceKeys()).toContain(
      "scope:two:" + "a".repeat(64),
    );
    expect(cache.drainRetiredSourceKeys()).toEqual([]);
    cache.delete("one");
    expect(cache.snapshot().entryCount).toBe(0);
    cache.resolve(original, resolve);
    cache.clear();
    expect(cache.snapshot().entryCount).toBe(0);
  });

  it("rejects invalid capacities", () => {
    expect(() => new MediaSourceCache(0)).toThrow("capacity");
    expect(() => new MediaSourceCache(Infinity)).toThrow("capacity");
  });
});
