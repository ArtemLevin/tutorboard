import { afterEach, describe, expect, it, vi } from "vitest";

import { boardObjectId } from "../core/public";
import {
  createEmbeddedImageObject,
  fitEmbeddedImageSize,
  imageMimeFromBytes,
  prepareEmbeddedImageFile,
  rasterDimensionsFromBytes,
  resolveEmbeddedImagePlacementSize,
  type PreparedEmbeddedImage,
} from "./image-import";

describe("embedded image import", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects supported signatures", () => {
    expect(
      imageMimeFromBytes(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe("image/png");
    expect(imageMimeFromBytes(new Uint8Array([255, 216, 255]))).toBe(
      "image/jpeg",
    );
    expect(imageMimeFromBytes(new Uint8Array([71, 73, 70, 56, 57, 97]))).toBe(
      "image/gif",
    );
    expect(
      imageMimeFromBytes(new Uint8Array(), "<svg viewBox='0 0 1 1'>"),
    ).toBe("image/svg+xml");
  });

  it("reads PNG and JPEG dimensions without browser image decode", () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
    png.set([0, 0, 16, 0], 16);
    png.set([0, 0, 12, 0], 20);
    expect(rasterDimensionsFromBytes(png, "image/png")).toEqual({
      height: 3_072,
      width: 4_096,
    });

    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
      0x08, 0x0c, 0x00, 0x10, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
      0x03, 0x11, 0x00,
    ]);
    expect(rasterDimensionsFromBytes(jpeg, "image/jpeg")).toEqual({
      height: 3_072,
      width: 4_096,
    });
  });

  it("validates PNG content with a 1x1 bitmap decode probe", async () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
    png.set([0, 0, 16, 0], 16);
    png.set([0, 0, 12, 0], 20);
    const close = vi.fn();
    const decode = vi.fn((blob: Blob, options?: ImageBitmapOptions) => {
      void blob;
      void options;
      return Promise.resolve({
        close,
      });
    });
    vi.stubGlobal("createImageBitmap", decode);

    const result = await prepareEmbeddedImageFile(
      new File([png], "probe.png", { type: "image/png" }),
    );

    expect(result.status).toBe("ok");
    expect(decode).toHaveBeenCalledOnce();
    expect(decode.mock.calls[0]?.[1]).toMatchObject({
      resizeHeight: 1,
      resizeQuality: "high",
      resizeWidth: 1,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("still rejects static rasters that fail actual browser decoding", async () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
    png.set([0, 0, 0, 16], 16);
    png.set([0, 0, 0, 12], 20);
    const decode = vi.fn((blob: Blob, options?: ImageBitmapOptions) => {
      void blob;
      void options;
      return Promise.reject(new Error("bad raster"));
    });
    vi.stubGlobal("createImageBitmap", decode);

    const result = await prepareEmbeddedImageFile(
      new File([png], "corrupt.png", { type: "image/png" }),
    );

    expect(result).toMatchObject({
      code: "image.decode-failed",
      status: "error",
    });
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("fits large and tiny images into a usable preserved ratio", () => {
    expect(fitEmbeddedImageSize({ height: 2000, width: 4000 })).toEqual({
      height: 360,
      width: 720,
    });
    expect(fitEmbeddedImageSize({ height: 1, width: 1 })).toEqual({
      height: 96,
      width: 96,
    });
  });

  it("uses selection, media, content, then viewport context for placement size", () => {
    const intrinsic = { height: 900, width: 1600 };
    const viewportSize = { height: 800, width: 1000 };

    expect(
      resolveEmbeddedImagePlacementSize(intrinsic, {
        selectedBounds: { height: 300, width: 400 },
        viewportSize,
        visibleContentBounds: [{ height: 600, width: 600 }],
        visibleMediaBounds: [{ height: 450, width: 600 }],
      }),
    ).toEqual({ height: 225, width: 400 });

    expect(
      resolveEmbeddedImagePlacementSize(intrinsic, {
        viewportSize,
        visibleContentBounds: [{ height: 240, width: 320 }],
        visibleMediaBounds: [
          { height: 200, width: 300 },
          { height: 400, width: 500 },
        ],
      }),
    ).toEqual({ height: 225, width: 400 });

    expect(
      resolveEmbeddedImagePlacementSize(intrinsic, {
        viewportSize,
        visibleContentBounds: [{ height: 240, width: 320 }],
        visibleMediaBounds: [],
      }),
    ).toEqual({ height: 180, width: 320 });

    expect(
      resolveEmbeddedImagePlacementSize(intrinsic, {
        viewportSize,
        visibleContentBounds: [],
        visibleMediaBounds: [],
      }),
    ).toEqual({ height: 236.25, width: 420 });
  });

  it("clamps extreme context while preserving the intrinsic aspect ratio", () => {
    const intrinsic = { height: 900, width: 1600 };
    const viewportSize = { height: 800, width: 1000 };

    expect(
      resolveEmbeddedImagePlacementSize(intrinsic, {
        selectedBounds: { height: 2_000, width: 2_000 },
        viewportSize,
        visibleContentBounds: [],
        visibleMediaBounds: [],
      }),
    ).toEqual({ height: 405, width: 720 });

    expect(
      resolveEmbeddedImagePlacementSize(intrinsic, {
        selectedBounds: { height: 20, width: 20 },
        viewportSize,
        visibleContentBounds: [],
        visibleMediaBounds: [],
      }),
    ).toEqual({ height: 81, width: 144 });
  });

  it("creates an embedded image around the requested contextual display size", () => {
    const prepared: PreparedEmbeddedImage = {
      contentSha256: "abc",
      dataUrl: "data:image/png;base64,AA==",
      fileName: "example.png",
      intrinsicSize: { height: 900, width: 1600 },
      mimeType: "image/png",
      size: { height: 360, width: 640 },
    };
    const object = createEmbeddedImageObject({
      center: { x: 500, y: 400 },
      displaySize: { height: 225, width: 400 },
      id: boardObjectId("object:image"),
      prepared,
    });

    expect(object.size).toEqual({ height: 225, width: 400 });
    expect(object.position).toEqual({ x: 300, y: 287.5 });
    expect(object.scale).toEqual({ x: 1, y: 1 });
  });
});
