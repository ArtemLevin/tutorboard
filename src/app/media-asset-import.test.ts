import { afterEach, describe, expect, it, vi } from "vitest";

import { boardObjectId, documentId, type BoardMediaAssetDescriptor } from "../core/public";
import {
  createMediaAssetObject,
  isRasterAssetCandidate,
  prepareRasterAssetFile,
  uploadBeforeCommand,
  type BoardMediaUploadSession,
  type PreparedRasterAsset,
} from "./media-asset-import";

const png = new Uint8Array(24);
png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
png.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
png.set([0, 0, 0, 16], 16);
png.set([0, 0, 0, 12], 20);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function descriptor(prepared: PreparedRasterAsset): BoardMediaAssetDescriptor {
  return {
    assetId: "asset:uploaded",
    byteSize: prepared.body.size,
    contentSha256: prepared.contentSha256,
    createdAt: "2026-10-08T11:00:00.000Z",
    fileName: prepared.fileName,
    intrinsicSize: prepared.intrinsicSize,
    mimeType: prepared.mimeType,
    status: "available",
  };
}

describe("media asset upload prerequisite", () => {
  it("recognizes raster candidates without routing SVG to binary storage", () => {
    expect(isRasterAssetCandidate(new File([png], "lesson.PNG"))).toBe(true);
    expect(isRasterAssetCandidate(new File(["<svg/>"], "drawing.svg"))).toBe(false);
  });

  it("prepares immutable raster bytes without dataUrl, hashes original bytes and closes probe", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close })));
    const file = new File([png], "../figure.png", { type: "image/png" });
    const result = await prepareRasterAssetFile(file);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.value.body).toBe(file);
    expect(result.value.fileName).toBe("figure.png");
    expect(result.value.intrinsicSize).toEqual({ width: 16, height: 12 });
    expect(result.value.contentSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.value).not.toHaveProperty("dataUrl");
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects invalid content by signature before uploading", async () => {
    const result = await prepareRasterAssetFile(
      new File(["<html>test</html>"], "photo.png", { type: "image/png" }),
    );
    expect(result).toMatchObject({ status: "error", code: "image.unsupported-format" });
  });

  it("returns only after AVAILABLE and rejects forged metadata", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close })));
    const prepared = await prepareRasterAssetFile(
      new File([png], "photo.png", { type: "image/png" }),
    );
    expect(prepared.status).toBe("ok");
    if (prepared.status !== "ok") return;
    let finish: (value: BoardMediaAssetDescriptor) => void = () => undefined;
    const uploadMedia = vi.fn(() => new Promise<BoardMediaAssetDescriptor>((resolve) => {
      finish = resolve;
    }));
    const session: BoardMediaUploadSession = {
      documentId: documentId("board:lesson"),
      getCsrfToken: async () => "csrf:board",
      isCurrent: () => true,
      uploadMedia,
    };
    const pending = uploadBeforeCommand(prepared.value, session, new AbortController().signal);
    await vi.waitFor(() => expect(uploadMedia).toHaveBeenCalledOnce());
    expect(uploadMedia.mock.calls[0]?.[0]).toMatchObject({
      body: prepared.value.body,
      contentSha256: prepared.value.contentSha256,
      csrfToken: "csrf:board",
      documentId: session.documentId,
      mimeType: "image/png",
    });
    finish(descriptor(prepared.value));
    await expect(pending).resolves.toMatchObject({ status: "ok" });
    const invalidSession = {
      ...session,
      uploadMedia: async () => ({ ...descriptor(prepared.value), byteSize: 100 }),
    };
    await expect(
      uploadBeforeCommand(prepared.value, invalidSession, new AbortController().signal),
    ).resolves.toMatchObject({ status: "error" });
  });

  it("cancels when access changes during an upload", async () => {
    const prepared: PreparedRasterAsset = {
      body: new Blob([png], { type: "image/png" }),
      contentSha256: "a".repeat(64),
      fileName: "photo.png",
      intrinsicSize: { width: 16, height: 12 },
      mimeType: "image/png",
    };
    const abort = new AbortController();
    const session: BoardMediaUploadSession = {
      documentId: documentId("board:lesson"),
      getCsrfToken: async () => "csrf:board",
      isCurrent: () => !abort.signal.aborted,
      uploadMedia: async () => {
        abort.abort();
        return descriptor(prepared);
      },
    };
    await expect(uploadBeforeCommand(prepared, session, abort.signal))
      .resolves.toEqual({ status: "cancelled" });
  });

  it("creates metadata-only media.asset objects using authoritative server fields", () => {
    const prepared: PreparedRasterAsset = {
      body: new Blob([png]),
      contentSha256: "a".repeat(64),
      fileName: "photo.png",
      intrinsicSize: { width: 16, height: 12 },
      mimeType: "image/png",
    };
    const result = createMediaAssetObject({
      center: { x: 500, y: 400 },
      descriptor: descriptor(prepared),
      displaySize: { width: 400, height: 300 },
      id: boardObjectId("object:uploaded"),
    });
    expect(result).toMatchObject({
      assetId: "asset:uploaded",
      byteSize: png.byteLength,
      contentSha256: prepared.contentSha256,
      kind: "media.asset",
      position: { x: 300, y: 250 },
    });
    expect(result).not.toHaveProperty("dataUrl");
    expect(result).not.toHaveProperty("storageKey");
  });
});
