import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createEmptyBoardDocument,
  documentId,
  type BoardDocument,
  type EmbeddedImageObject,
} from "../../core/public";
import {
  createImageScaleStepTransforms,
  nextImageScaleStep,
} from "./image-scale";

function image(
  id: string,
  overrides: Partial<EmbeddedImageObject> = {},
): EmbeddedImageObject {
  return {
    contentSha256: id,
    dataUrl: "data:image/png;base64,AA==",
    fileName: `${id}.png`,
    groupId: null,
    id: boardObjectId(id),
    intrinsicSize: { height: 100, width: 200 },
    kind: "image.embedded",
    locked: false,
    mimeType: "image/png",
    position: { x: 50, y: 60 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { height: 100, width: 200 },
    source: { kind: "user" },
    style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
    visible: true,
    ...overrides,
  };
}

function documentWith(
  ...objects: readonly EmbeddedImageObject[]
): BoardDocument {
  const base = createEmptyBoardDocument({
    createdAt: "2026-10-04T16:00:00.000Z",
    id: documentId("document:image-scale"),
    title: "Image scale",
  });
  return {
    ...base,
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order: objects.map(({ id }) => id),
  };
}

describe("image scale steps", () => {
  it("moves through 50 percentage-point steps", () => {
    expect(nextImageScaleStep(0.5, "increase")).toBe(1);
    expect(nextImageScaleStep(1, "increase")).toBe(1.5);
    expect(nextImageScaleStep(1.2, "increase")).toBe(1.5);
    expect(nextImageScaleStep(1.5, "decrease")).toBe(1);
    expect(nextImageScaleStep(1.2, "decrease")).toBe(1);
    expect(nextImageScaleStep(0.5, "decrease")).toBe(0.5);
  });

  it("preserves the center of a rotated image while scaling", () => {
    const target = image("object:rotated", { rotation: 90 });
    const transforms = createImageScaleStepTransforms(
      documentWith(target),
      [target.id],
      "increase",
    );
    expect(transforms).toEqual([
      {
        objectId: target.id,
        position: { x: 75, y: 10 },
        rotation: 90,
        scale: { x: 1.5, y: 1.5 },
      },
    ]);
  });

  it("preserves legacy non-uniform aspect ratio while stepping by representative scale", () => {
    const target = image("object:legacy", {
      position: { x: 10, y: 20 },
      scale: { x: 2, y: 0.5 },
    });
    const transforms = createImageScaleStepTransforms(
      documentWith(target),
      [target.id],
      "increase",
    );
    expect(transforms).toEqual([
      {
        objectId: target.id,
        position: { x: -90, y: 7.5 },
        rotation: 0,
        scale: { x: 3, y: 0.75 },
      },
    ]);
  });

  it("scales an eligible multi-selection in one transform set", () => {
    const first = image("object:first");
    const second = image("object:second", {
      position: { x: 400, y: 200 },
      scale: { x: 1.5, y: 1.5 },
    });
    const transforms = createImageScaleStepTransforms(
      documentWith(first, second),
      [first.id, second.id],
      "increase",
    );
    expect(transforms).toHaveLength(2);
    expect(transforms?.map(({ scale }) => scale)).toEqual([
      { x: 1.5, y: 1.5 },
      { x: 2, y: 2 },
    ]);
  });

  it("leaves locked selections and minimum-scale images unchanged", () => {
    const locked = image("object:locked", { locked: true });
    expect(
      createImageScaleStepTransforms(
        documentWith(locked),
        [locked.id],
        "increase",
      ),
    ).toBeNull();

    const minimum = image("object:minimum", { scale: { x: 0.5, y: 0.5 } });
    expect(
      createImageScaleStepTransforms(
        documentWith(minimum),
        [minimum.id],
        "decrease",
      ),
    ).toBeNull();
  });
});
