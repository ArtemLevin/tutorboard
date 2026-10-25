import { describe, expect, it, vi } from "vitest";

import { readBoardDocument } from "../../../../src/core/public";
import { discardClearedBoardEmbeddedImages } from "../../../../src/adapters/canvas-konva/cleared-board-media-cache";
import {
  RasterDecodeCache,
  type RasterDecodeRequest,
} from "../../../../src/adapters/canvas-konva/raster-decode-cache";
import { RasterImageDiagnostics } from "../../../../src/adapters/canvas-konva/raster-image-diagnostics";
import { createDenseBoardDocument } from "../../../fixtures/dense-board";

describe("scoped bitmap release after board clear", () => {
  it("retires the cleared document's bitmap after the last user releases it", async () => {
    const read = readBoardDocument(
      createDenseBoardDocument({ strokeCount: 1, staticCount: 1 }),
    );
    if (read.status !== "ok") throw new Error("Invalid bitmap fixture");
    const doc = read.document;
    const embedded = doc.order
      .map((id) => doc.objects[id])
      .find((object) => object?.kind === "image.embedded");
    if (embedded?.kind !== "image.embedded") {
      throw new Error("Missing embedded image fixture");
    }

    const clearedClose = vi.fn();
    const unrelatedClose = vi.fn();
    const cache = new RasterDecodeCache({
      diagnostics: new RasterImageDiagnostics(),
      decoder: vi.fn((request: RasterDecodeRequest) =>
        Promise.resolve({
          close:
            request.dataUrl === embedded.dataUrl
              ? clearedClose
              : unrelatedClose,
          height: 64,
          image: document.createElement("canvas"),
          width: 64,
        }),
      ),
    });
    const request = {
      contentSha256: embedded.contentSha256,
      dataUrl: embedded.dataUrl,
      size: { width: 64, height: 64 },
    };
    // A second consumer might still be rendering the same bitmap.
    const owner = cache.acquire(request);
    const shared = cache.acquire(request);
    const unrelated = cache.acquire({
      contentSha256: "a".repeat(64),
      dataUrl: "data:image/png;base64,unrelated",
      size: { width: 64, height: 64 },
    });
    await Promise.all([owner.promise, shared.promise, unrelated.promise]);
    owner.release();
    unrelated.release();
    expect(cache.snapshot().retainedEntryCount).toBe(1);

    discardClearedBoardEmbeddedImages(new Set([embedded.dataUrl]), cache);
    expect(clearedClose).not.toHaveBeenCalled();
    expect(unrelatedClose).not.toHaveBeenCalled();
    shared.release();
    expect(clearedClose).toHaveBeenCalledOnce();
    expect(unrelatedClose).not.toHaveBeenCalled();
    expect(cache.snapshot()).toMatchObject({
      activeReferences: 0,
      entryCount: 1,
      retainedEntryCount: 1,
      retainedBytes: 64 * 64 * 4,
    });

    // Repeating the cleanup is safe and never evicts a different source.
    discardClearedBoardEmbeddedImages(new Set([embedded.dataUrl]), cache);
    expect(clearedClose).toHaveBeenCalledOnce();
    expect(unrelatedClose).not.toHaveBeenCalled();
    cache.clear();
  });

  it("does nothing when no cached sources were supplied", () => {
    const discard = vi.fn();
    discardClearedBoardEmbeddedImages([], {
      discardSourceWhenUnused: discard,
    });
    expect(discard).not.toHaveBeenCalled();
  });
});
