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
    dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
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
  it("keeps static boards in the legacy single Layer", () => {
    const items = [object(0), object(1)];
    const runs = partitionCommittedPaintRuns([items]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.batches[0]).toEqual(items);
  });

  it("isolates GIF redraws but preserves exact interleaved order", () => {
    const objects = [object(0), object(1, true), object(2), object(3, true)];
    const runs = partitionCommittedPaintRuns([objects.slice(0, 2), objects.slice(2)]);
    expect(runs.map(({ animated }) => animated)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(ids(runs)).toEqual(objects.map(({ object }) => object.id));
    expect(new Set(runs.map(({ key }) => key)).size).toBe(4);
  });

  it("combines 600 immutable strokes into one static Layer around GIFs", () => {
    const ink = Array.from({ length: 600 }, (_, index) => object(index));
    const runs = partitionCommittedPaintRuns([
      ink.slice(0, 250),
      ink.slice(250, 500),
      [...ink.slice(500), object(600, true), object(601, true)],
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.batches.map((batch) => batch.length)).toEqual([
      250,
      250,
      100,
    ]);
    expect(runs[1]?.animated).toBe(true);
    expect(ids(runs)).toEqual([...ink, object(600, true), object(601, true)].map(({ object }) => object.id));
  });

  it("falls back to one Layer when alternation exceeds the memory budget", () => {
    const items = Array.from({ length: maximumCommittedPaintLayers + 2 }, (_, index) =>
      object(index, index % 2 === 1),
    );
    const original = [items.slice(0, 3), items.slice(3)];
    const runs = partitionCommittedPaintRuns(original);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.batches).toBe(original);
    expect(ids(runs)).toEqual(items.map(({ object }) => object.id));
  });

  it("does not cross the run boundary for unrelated static/animated objects", () => {
    const runs = partitionCommittedPaintRuns([[object(1, true), object(2), object(3, true)]]);
    expect(runs).toHaveLength(3);
    expect(ids(runs)).toEqual([1, 2, 3].map((index) => object(index).object.id));
  });

  it("rejects unbounded or invalid layer budgets", () => {
    expect(() => partitionCommittedPaintRuns([[object(1)]], 0)).toThrow(
      RangeError,
    );
    expect(() => partitionCommittedPaintRuns([[object(1)]], 1.5)).toThrow(
      RangeError,
    );
  });
});
