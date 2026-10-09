import { describe, expect, it } from "vitest";

import {
  maximumCommittedPaintLayers,
  partitionCommittedPaintRuns,
} from "../../../../src/adapters/canvas-konva/committed-paint-runs";
import {
  boardObjectId,
  type BoardRenderItem,
  type EmbeddedImageObject,
} from "../../../../src/core/public";

function object(index: number, gif = false): BoardRenderItem {
  const base = {
    groupId: null,
    id: boardObjectId(`object:paint-run:${index}`),
    locked: false,
    position: { x: index * 10, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" as const },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#17202a",
      strokeWidth: 2,
    },
    visible: true,
  };
  if (!gif) {
    return {
      object: {
        ...base,
        kind: "drawing.text",
        text: `Text ${index}`,
      },
      transforms: [],
    };
  }
  const image: EmbeddedImageObject = {
    ...base,
    contentSha256: "a".repeat(64),
    dataUrl:
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    fileName: `animated-${index}.gif`,
    intrinsicSize: { height: 1, width: 1 },
    kind: "image.embedded",
    mimeType: "image/gif",
    size: { height: 20, width: 20 },
  };
  return { object: image, transforms: [] };
}

function ids(runs: ReturnType<typeof partitionCommittedPaintRuns>) {
  return runs.flatMap((run) =>
    run.batches.flatMap((batch) => batch.map(({ object }) => object.id)),
  );
}

describe("bounded committed paint runs", () => {
  it("retains one Layer on static-only scenes", () => {
    const items = [object(0), object(1)];
    const runs = partitionCommittedPaintRuns([items]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.batches[0]).toEqual(items);
  });

  it("retains one animated Layer on GIF-only scenes", () => {
    const runs = partitionCommittedPaintRuns([[object(0, true)]]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.animated).toBe(true);
  });

  it("preserves arbitrary interleaved object order", () => {
    const objects = [object(0), object(1, true), object(2), object(3, true)];
    const runs = partitionCommittedPaintRuns([
      objects.slice(0, 2),
      objects.slice(2),
    ]);
    expect(runs.map((run) => run.animated)).toEqual([false, true, false, true]);
    expect(ids(runs)).toEqual(objects.map((item) => item.object.id));
    expect(new Set(runs.map((run) => run.key)).size).toBe(4);
  });

  it("partitions 600 static items into static and GIF Layers", () => {
    const ink = Array.from({ length: 600 }, (_, index) => object(index));
    const gifA = object(600, true);
    const gifB = object(601, true);
    const runs = partitionCommittedPaintRuns([
      ink.slice(0, 250),
      ink.slice(250, 500),
      [...ink.slice(500), gifA, gifB],
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.batches.map((batch) => batch.length)).toEqual([
      250, 250, 100,
    ]);
    expect(runs[1]?.animated).toBe(true);
    const expectedIds = [...ink, gifA, gifB].map((item) => item.object.id);
    expect(ids(runs)).toEqual(expectedIds);
  });

  it("falls back to one Layer when the run cap is exceeded", () => {
    const items = Array.from(
      { length: maximumCommittedPaintLayers + 2 },
      (_, index) => object(index, index % 2 === 1),
    );
    const batches = [items.slice(0, 3), items.slice(3)];
    const runs = partitionCommittedPaintRuns(batches);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.batches).toBe(batches);
    expect(ids(runs)).toEqual(items.map((item) => item.object.id));
  });

  it("preserves leading and trailing GIF ordering", () => {
    const runs = partitionCommittedPaintRuns([
      [object(1, true), object(2), object(3, true)],
    ]);
    expect(runs).toHaveLength(3);
    const expected = [1, 2, 3].map((index) => object(index).object.id);
    expect(ids(runs)).toEqual(expected);
  });

  it("rejects non-positive or fractional layer caps", () => {
    expect(() => partitionCommittedPaintRuns([[object(1)]], 0)).toThrow(
      RangeError,
    );
    expect(() => partitionCommittedPaintRuns([[object(1)]], 1.5)).toThrow(
      RangeError,
    );
  });
});
