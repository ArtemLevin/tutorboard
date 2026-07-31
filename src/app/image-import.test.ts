import { describe, expect, it } from "vitest";

import { fitEmbeddedImageSize, imageMimeFromBytes } from "./image-import";

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
});
