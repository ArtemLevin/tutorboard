import { describe, expect, it } from "vitest";

import { createDenseBoardDocument } from "../fixtures/dense-board";

function visiblePaintRuns(
  document: ReturnType<typeof createDenseBoardDocument>,
) {
  let previousAnimated: boolean | null = null;
  let runs = 0;
  let animatedRuns = 0;
  for (const id of document.order) {
    const object = document.objects[id];
    if (object === undefined) throw new Error("Missing fixture object " + id);
    if (object.kind === "drawing.pen-stroke" && object.position.x >= 10_000) {
      continue;
    }
    const animated =
      object.kind === "image.embedded" && object.mimeType === "image/gif";
    if (previousAnimated === null || animated !== previousAnimated) {
      runs += 1;
      if (animated) animatedRuns += 1;
      previousAnimated = animated;
    }
  }
  return { runs, animatedRuns };
}

describe("C3.9-E2 split fixture visibility", () => {
  it("places an ink segment between GIF runs while retaining exact document content", () => {
    const options = {
      strokeCount: 3000,
      visibleStrokeCount: 800,
      staticCount: 6,
      gifCount: 4,
      zOrderPattern: "split",
      strokeGeometry: "varied",
    } as const;
    const legacy = createDenseBoardDocument(options);
    const e2 = createDenseBoardDocument({
      ...options,
      splitAtVisibleBoundary: true,
    });
    expect(visiblePaintRuns(legacy)).toEqual({ runs: 3, animatedRuns: 1 });
    expect(visiblePaintRuns(e2)).toEqual({ runs: 5, animatedRuns: 2 });
    expect(e2.objects).toEqual(legacy.objects);
    expect(new Set(e2.order)).toEqual(new Set(legacy.order));
  });

  it("leaves the default fixture and fully visible split unchanged", () => {
    const input = {
      strokeCount: 100,
      visibleStrokeCount: 100,
      gifCount: 2,
      zOrderPattern: "split",
    } as const;
    expect(createDenseBoardDocument(input)).toEqual(
      createDenseBoardDocument({ ...input, splitAtVisibleBoundary: true }),
    );
  });
});
