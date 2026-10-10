import { describe, expect, it } from "vitest";
import { createDenseBoardDocument } from "../fixtures/dense-board";

describe("large static image document fixture", () => {
  it("preserves old default PNG-only formats when options are absent", () => {
    const doc = createDenseBoardDocument({ strokeCount: 5, staticCount: 2 });
    const media = doc.order
      .map((id) => doc.objects[id])
      .filter((object) => object.kind === "image.embedded");
    expect(media.map((object) => [object.mimeType, object.fileName])).toEqual([
      ["image/png", "image-0.png"],
      ["image/png", "image-1.png"],
    ]);
  });

  it("assigns image/jpeg to both .jpg and .jpeg, with no GIFs", () => {
    const formats = ["png", "jpg", "jpeg"] as const;
    const doc = createDenseBoardDocument({
      strokeCount: 3000,
      visibleStrokeCount: 800,
      staticCount: 3,
      gifCount: 0,
      staticImageFormats: formats,
      largeStaticDataUrls: [
        "data:image/png;base64,AAA",
        "data:image/jpeg;base64,BBB",
        "data:image/jpeg;base64,CCC",
      ],
    });
    const media = doc.order
      .map((id) => doc.objects[id])
      .filter((object) => object.kind === "image.embedded");
    expect(media.map((object) => [object.mimeType, object.fileName])).toEqual([
      ["image/png", "image-0.png"],
      ["image/jpeg", "image-1.jpg"],
      ["image/jpeg", "image-2.jpeg"],
    ]);
    expect(
      media.every((object) => object.dataUrl.startsWith("data:image/")),
    ).toBe(true);
    expect(doc.order.length).toBe(3003);
  });
});
