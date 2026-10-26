import { expect, it } from "vitest";

import * as core from "../../../src/core/public";
import {
  maximumBoardCommandJsonBytes,
  readBoardCommandJson,
} from "../../../src/core/board/commands/codec/public";
import {
  createFullBoardCut,
  planAtomicFullBoardClear,
} from "../../../src/app/board/atomic-clear-plan";
import { loadCurrentBoardFixture, metadata, rectangle } from "../core/helpers";

function board(count: number): core.BoardDocument {
  const parsed = core.readBoardDocument(loadCurrentBoardFixture());
  if (parsed.status !== "ok") throw new Error("Invalid seed board");
  const objects = Array.from({ length: count }, (_, i) =>
    rectangle(`bulk-clear:${i}`),
  );
  return {
    ...parsed.document,
    objects: {
      ...parsed.document.objects,
      ...Object.fromEntries(objects.map((item) => [item.id, item])),
    },
    order: [...parsed.document.order, ...objects.map((item) => item.id)],
  };
}

it("plans more than 10k objects as a single transportable atomic clear batch", () => {
  const source = board(10_020);
  let sequence = 0;
  const planned = planAtomicFullBoardClear(source, () =>
    metadata(`atomic-cut:${++sequence}`),
  );
  expect(planned).not.toBeNull();
  if (planned === null) throw new Error("Batch should be representable");
  expect(planned.length).toBeGreaterThan(1);
  expect(planned.length).toBeLessThanOrEqual(100);
  let current = source;
  for (const command of planned) {
    expect(command.objectIds.length).toBeLessThanOrEqual(10_000);
    const json = JSON.stringify(command);
    expect(new TextEncoder().encode(json).byteLength).toBeLessThanOrEqual(
      maximumBoardCommandJsonBytes,
    );
    expect(readBoardCommandJson(json).status).toBe("ok");
    const result = core.reduceBoardDocument(current, command);
    if (!result.ok) throw new Error(result.error.message);
    current = result.document;
  }
  expect(current.order).toEqual([]);
  expect(current.objects).toEqual({});
  expect(current.groups).toEqual({});
});

it("keeps a shared group dependency complete inside one cut", () => {
  const source = board(10_010);
  const first = source.order.at(-10_010)!;
  const last = source.order.at(-1)!;
  const groupId = core.groupId("group:far-apart");
  const grouped: core.BoardDocument = {
    ...source,
    objects: {
      ...source.objects,
      [first]: { ...source.objects[first]!, groupId },
      [last]: { ...source.objects[last]!, groupId },
    },
    groups: {
      ...source.groups,
      [groupId]: {
        id: groupId,
        locked: false,
        objectIds: [first, last],
        transform: {
          rotation: 0,
          scale: { x: 1, y: 1 },
          translation: { x: 0, y: 0 },
        },
      },
    },
  };
  let index = 0;
  const commands = planAtomicFullBoardClear(grouped, () =>
    metadata(`group-cut:${++index}`),
  );
  expect(commands).not.toBeNull();
  expect(
    commands?.filter((cut) => cut.groupIds.includes(groupId)),
  ).toHaveLength(1);
  expect(
    commands?.find((cut) => cut.groupIds.includes(groupId))?.objectIds,
  ).toEqual(expect.arrayContaining([first, last]));
});

it("refuses an indivisible group above transport limits before any mutation", () => {
  const source = board(10_001);
  const groupId = core.groupId("group:oversized");
  const objects = Object.fromEntries(
    source.order.map((id) => [id, { ...source.objects[id]!, groupId }]),
  ) as core.BoardDocument["objects"];
  const grouped: core.BoardDocument = {
    ...source,
    objects,
    groups: {
      [groupId]: {
        id: groupId,
        locked: false,
        objectIds: [...source.order],
        transform: {
          rotation: 0,
          scale: { x: 1, y: 1 },
          translation: { x: 0, y: 0 },
        },
      },
    },
  };
  expect(
    planAtomicFullBoardClear(grouped, () => metadata("oversized")),
  ).toBeNull();
  expect(grouped.order).toHaveLength(source.order.length);
});

it("creates a local full cut without copying the heavy stroke objects", () => {
  const source = board(2);
  const command = createFullBoardCut(source, metadata("local-cut"));
  expect(command.objectIds).toEqual(source.order);
  expect(command.objectIds).not.toBe(source.order);
  expect(command.groupIds).toEqual(Object.keys(source.groups));
});
