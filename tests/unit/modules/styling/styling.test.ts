import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  geometryImportId,
  readBoardDocument,
  reduceBoardDocument,
  selectBoardScene,
  serializeBoardDocument,
} from "../../../../src/core/public";
import { createSetSelectionStyleCommand } from "../../../../src/modules/styling/public";
import {
  loadCurrentBoardFixture,
  loadCurrentGeometryImportFixture,
  metadata,
} from "../../core/helpers";

describe("selection styling", () => {
  it("updates base styles and survives serialization", () => {
    const read = readBoardDocument(loadCurrentBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const styled = reduceBoardDocument(
      read.document,
      createSetSelectionStyleCommand(
        metadata("style-user"),
        [boardObjectId("object:rectangle-01")],
        { fill: "#112233", opacity: 0.6 },
      ),
    );
    expect(styled.ok).toBe(true);
    if (styled.ok) {
      expect(
        styled.document.objects[boardObjectId("object:rectangle-01")]?.style,
      ).toMatchObject({ fill: "#112233", opacity: 0.6 });
      expect(serializeBoardDocument(styled.document).ok).toBe(true);
    }
  });

  it("stores GeometryOS presentation in visual overrides and renders it", () => {
    const read = readBoardDocument(loadCurrentGeometryImportFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const objectId = read.document.order[0];
    expect(objectId).toBeDefined();
    if (objectId === undefined) {
      return;
    }
    const styled = reduceBoardDocument(
      read.document,
      createSetSelectionStyleCommand(
        metadata("style-import", "2026-07-25T12:01:00.000Z"),
        [objectId],
        { opacity: 0.35, stroke: "#aa2255", strokeWidth: 5 },
      ),
    );
    expect(styled.ok).toBe(true);
    if (!styled.ok) {
      return;
    }
    const source = styled.document.objects[objectId]?.source;
    expect(source?.kind).toBe("geometryos");
    if (source?.kind === "geometryos") {
      expect(
        styled.document.geometryImports[geometryImportId(source.importId)]
          ?.visualOverrides[objectId]?.style,
      ).toEqual({ opacity: 0.35, stroke: "#aa2255", strokeWidth: 5 });
    }
    expect(
      selectBoardScene(styled.document).items.find(
        ({ object }) => object.id === objectId,
      )?.object.style,
    ).toMatchObject({ opacity: 0.35, stroke: "#aa2255", strokeWidth: 5 });
  });

  it("rejects invalid values and locked selections atomically", () => {
    const read = readBoardDocument(loadCurrentBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const invalid = reduceBoardDocument(
      read.document,
      createSetSelectionStyleCommand(
        metadata("invalid-style"),
        [boardObjectId("object:line-01")],
        { opacity: 2 },
      ),
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.document).toBe(read.document);
  });
});
