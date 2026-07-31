import { describe, expect, it } from "vitest";

import { boardObjectId } from "../../core/public";
import { createImageObject, imageImportLimits } from "./importer";

const base = {
  center: { x: 500, y: 400 },
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  id: boardObjectId("object:image:test"),
  mimeType: "image/png" as const,
  name: "lesson.png",
};

describe("image import", () => {
  it("fits large images into the initial viewport box", () => {
    const result = createImageObject({
      ...base,
      naturalSize: { width: 2400, height: 1600 },
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.object.size.width).toBeLessThanOrEqual(
      imageImportLimits.maxInitialWidth,
    );
    expect(result.object.size.height).toBeLessThanOrEqual(
      imageImportLimits.maxInitialHeight,
    );
    expect(result.object.size.width / result.object.size.height).toBeCloseTo(
      1.5,
    );
    expect(result.object.position.x + result.object.size.width / 2).toBe(500);
  });

  it("rejects invalid and oversized dimensions", () => {
    expect(
      createImageObject({
        ...base,
        naturalSize: { width: imageImportLimits.maxDimension + 1, height: 10 },
      }).status,
    ).toBe("error");
  });
});
