import { describe, expect, it } from "vitest";

import {
  groupId,
  readBoardDocument,
  selectBoardScene,
} from "../../../src/core/public";
import { loadBoardFixture, loadGeometryImportFixture } from "./helpers";

describe("board scene selector", () => {
  it("produces an ordered renderer read model without exposing the document", () => {
    const read = readBoardDocument(loadBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const scene = selectBoardScene(read.document);

    expect(scene.items.map(({ object }) => object.id)).toEqual(
      read.document.order,
    );
    expect(scene.items[0]?.transforms).toEqual([
      read.document.groups[groupId("group:example-01")]?.transform,
    ]);
    expect(Object.keys(scene).sort()).toEqual(["items", "viewport"]);
  });

  it("uses import transform and per-object override instead of root group state", () => {
    const raw = loadGeometryImportFixture();
    const imports = raw.geometryImports as Record<
      string,
      Record<string, unknown>
    >;
    imports["import:geometry-01"]!.visualOverrides = {
      "object:geometry-point-A": {
        rotation: 0,
        scale: { x: 1, y: 1 },
        translation: { x: 8, y: -3 },
      },
    };
    const read = readBoardDocument(raw);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const [item] = selectBoardScene(read.document).items;

    expect(item?.transforms).toEqual([
      expect.objectContaining({ translation: { x: 320, y: 180 } }),
      expect.objectContaining({ translation: { x: 8, y: -3 } }),
    ]);
  });
});
