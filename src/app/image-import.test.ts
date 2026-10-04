import { describe, expect, it } from "vitest";

import { boardObjectId } from "../core/public";
import {
  createEmbeddedImageObject,
  fitEmbeddedImageSize,
  imageMimeFromBytes,
  resolveEmbeddedImagePlacementSize,
  type PreparedEmbeddedImage,
} from "./image-import";

describe("embedded image import", () => {
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
