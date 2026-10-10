import { describe, expect, it } from "vitest";

import { readBoardDocument } from "../../../src/core/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

describe("C3.9 representative large-board fixture", () => {
  it("preserves legacy scene ordering and repeated geometry by default", () => {
    const doc = createDenseBoardDocument({
      strokeCount: 12,
      staticCount: 2,
      gifCount: 1,
    });
    expect(doc.order[0]).toBe("object:dense:stroke:0");
    expect(doc.order.at(-1)).toBe("object:dense:image:2");
    expect(doc.objects["object:dense:stroke:0"]?.kind).toBe(
      "drawing.pen-stroke",
    );
    expect(doc.objects["object:dense:stroke:1"]?.kind).toBe(
      "drawing.pen-stroke",
    );
  });

  it("creates distinct deterministic multi-segment strokes with requested visible density", () => {
    const options = {
      strokeCount: 50,
      visibleStrokeCount: 20,
      staticCount: 2,
      gifCount: 2,
      strokeGeometry: "varied" as const,
      zOrderPattern: "split" as const,
    };
    const a = createDenseBoardDocument(options);
    const b = createDenseBoardDocument(options);
    expect(a).toEqual(b);
    expect(a.order).toHaveLength(54);
    expect(new Set(a.order).size).toBe(54);
    const stroke = a.objects["object:dense:stroke:3"];
    expect(stroke?.kind).toBe("drawing.pen-stroke");
    if (stroke?.kind !== "drawing.pen-stroke") return;
    expect(stroke.ink.centerline.length).toBeGreaterThan(2);
    expect(a.objects["object:dense:stroke:5"]?.position.x).toBeLessThan(10_000);
    expect(
      a.objects["object:dense:stroke:20"]?.position.x,
    ).toBeGreaterThanOrEqual(10_000);
    expect(readBoardDocument(a).status).toBe("ok");
  });

  it("preserves all IDs and exercises the >6 layer alternating fallback", () => {
    const doc = createDenseBoardDocument({
      strokeCount: 72,
      staticCount: 6,
      gifCount: 4,
      strokeGeometry: "varied",
      zOrderPattern: "alternating",
      animatedGifDataUrl:
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      animatedGifSize: { width: 64, height: 64 },
    });
    expect(doc.order).toHaveLength(82);
    expect(new Set(doc.order).size).toBe(doc.order.length);
    expect(
      doc.order.some(
        (id, index) =>
          id.includes(":image:") && doc.order[index + 1]?.includes(":stroke:"),
      ),
    ).toBe(true);
    expect(readBoardDocument(doc).status).toBe("ok");
  });
});
