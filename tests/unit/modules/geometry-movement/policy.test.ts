import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  geometryImportId,
  readBoardDocument,
  reduceBoardDocument,
  selectBoardScene,
  type BoardDocument,
  type TextObject,
} from "../../../../src/core/public";
import {
  classifyGeometryChange,
  createOffsetGeometryLabelCommand,
  createSetGeometryVisualStyleCommand,
  createTranslateGeometryImportCommand,
  InMemoryGeometryMovementExperimentLog,
  recordGeometryMovementDecision,
} from "../../../../src/modules/geometry-movement/public";
import { createMoveSelectionCommand } from "../../../../src/modules/selection/public";
import { loadGeometryImportFixture, metadata } from "../../core/helpers";

const importId = geometryImportId("import:geometry-01");
const pointId = boardObjectId("object:geometry-point-A");
const labelId = boardObjectId("object:geometry-label-A");

function movementMetadata(
  suffix: string,
  timestamp = "2026-07-24T13:02:00.000Z",
) {
  return metadata(suffix, timestamp);
}

function geometryDocument(): BoardDocument {
  const read = readBoardDocument(loadGeometryImportFixture());
  if (read.status !== "ok") {
    throw new Error(`Geometry fixture is invalid: ${read.status}`);
  }
  const record = read.document.geometryImports[importId];
  if (record === undefined) {
    throw new Error("Geometry fixture import is missing.");
  }
  const group = read.document.groups[record.rootGroupId];
  if (group === undefined) {
    throw new Error("Geometry fixture root group is missing.");
  }
  const label: TextObject = {
    groupId: group.id,
    id: labelId,
    kind: "drawing.text",
    locked: false,
    position: { x: 12, y: -16 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: {
      girEntityId: "label:A",
      girEntityType: "label",
      importId,
      kind: "geometryos",
    },
    style: {
      fill: "#111827",
      opacity: 1,
      stroke: null,
      strokeWidth: 0,
    },
    text: "A",
    visible: true,
  };
  return {
    ...read.document,
    geometryImports: {
      ...read.document.geometryImports,
      [importId]: {
        ...record,
        boardObjectIds: [...record.boardObjectIds, labelId],
        mapping: { ...record.mapping, "label:A": [labelId] },
      },
    },
    groups: {
      ...read.document.groups,
      [group.id]: {
        ...group,
        objectIds: [...group.objectIds, labelId],
      },
    },
    objects: { ...read.document.objects, [labelId]: label },
    order: [...read.document.order, labelId],
  };
}

describe("geometry movement policy", () => {
  it("moves the selected construction through its import transform", () => {
    const document = geometryDocument();
    const canonicalGirBefore = JSON.stringify(
      document.geometryImports[importId]?.canonicalGir,
    );
    const result = reduceBoardDocument(
      document,
      createMoveSelectionCommand(
        movementMetadata("move-import"),
        document,
        [pointId],
        { x: 24, y: -8 },
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      result.document.geometryImports[importId]?.visualTransform.translation,
    ).toEqual({ x: 344, y: 172 });
    expect(
      result.document.groups[
        result.document.geometryImports[importId]!.rootGroupId
      ]?.transform.translation,
    ).toEqual({ x: 0, y: 0 });
    expect(result.document.objects[pointId]?.position).toEqual({ x: 0, y: 0 });
    expect(
      JSON.stringify(result.document.geometryImports[importId]?.canonicalGir),
    ).toBe(canonicalGirBefore);
  });

  it("supports explicit construction translation and rejects locked imports", () => {
    const document = geometryDocument();
    const moved = reduceBoardDocument(
      document,
      createTranslateGeometryImportCommand(
        movementMetadata("translate-import"),
        importId,
        { x: -20, y: 10 },
      ),
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      return;
    }
    expect(
      moved.document.geometryImports[importId]?.visualTransform.translation,
    ).toEqual({ x: 300, y: 190 });

    const rootGroupId = moved.document.geometryImports[importId]?.rootGroupId;
    if (rootGroupId === undefined) {
      throw new Error("Moved import root group is missing.");
    }
    const lockedDocument = {
      ...moved.document,
      groups: {
        ...moved.document.groups,
        [rootGroupId]: {
          ...moved.document.groups[rootGroupId]!,
          locked: true,
        },
      },
    };
    const rejected = reduceBoardDocument(
      lockedDocument,
      createTranslateGeometryImportCommand(
        movementMetadata("locked-import", "2026-07-24T13:03:00.000Z"),
        importId,
        { x: 1, y: 1 },
      ),
    );
    expect(rejected.ok).toBe(false);
    expect(rejected.document).toBe(lockedDocument);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe("command.locked");
    }
  });

  it("stores label offsets and styles as visual overrides", () => {
    const document = geometryDocument();
    const offset = reduceBoardDocument(
      document,
      createOffsetGeometryLabelCommand(
        movementMetadata("offset-label"),
        importId,
        labelId,
        { x: 9, y: -4 },
      ),
    );
    expect(offset.ok).toBe(true);
    if (!offset.ok) {
      return;
    }
    const styled = reduceBoardDocument(
      offset.document,
      createSetGeometryVisualStyleCommand(
        movementMetadata("style-label", "2026-07-24T13:03:00.000Z"),
        importId,
        labelId,
        { fill: "#dc2626", opacity: 0.75 },
      ),
    );
    expect(styled.ok).toBe(true);
    if (!styled.ok) {
      return;
    }
    expect(
      styled.document.geometryImports[importId]?.visualOverrides[labelId],
    ).toMatchObject({
      style: { fill: "#dc2626", opacity: 0.75 },
      translation: { x: 9, y: -4 },
    });
    const labelItem = selectBoardScene(styled.document).items.find(
      ({ object }) => object.id === labelId,
    );
    expect(labelItem?.object.style).toMatchObject({
      fill: "#dc2626",
      opacity: 0.75,
    });
    expect(labelItem?.transforms.at(-1)?.translation).toEqual({ x: 9, y: -4 });
    expect(styled.document.objects[labelId]?.style.fill).toBe("#111827");

    const invalidLabel = reduceBoardDocument(
      document,
      createOffsetGeometryLabelCommand(
        movementMetadata("offset-point"),
        importId,
        pointId,
        { x: 1, y: 1 },
      ),
    );
    expect(invalidLabel.ok).toBe(false);
    expect(invalidLabel.document).toBe(document);

    const invalidStyle = reduceBoardDocument(
      document,
      createSetGeometryVisualStyleCommand(
        movementMetadata("invalid-style"),
        importId,
        labelId,
        { opacity: 2 },
      ),
    );
    expect(invalidStyle.ok).toBe(false);
    expect(invalidStyle.document).toBe(document);
  });

  it("keeps individual imported point moves and semantic deletes blocked", () => {
    const document = geometryDocument();
    for (const command of [
      {
        ...movementMetadata("point-move"),
        delta: { x: 1, y: 1 },
        kind: "core.objects.move" as const,
        objectIds: [pointId],
      },
      {
        ...movementMetadata("point-delete"),
        kind: "core.objects.delete" as const,
        objectIds: [pointId],
      },
    ]) {
      const result = reduceBoardDocument(document, command);
      expect(result.ok).toBe(false);
      expect(result.document).toBe(document);
    }
  });

  it("classifies and records visual versus mathematical changes", () => {
    expect(classifyGeometryChange("construction-translation")).toMatchObject({
      allowed: true,
      classification: "visual",
    });
    expect(classifyGeometryChange("label-offset")).toMatchObject({
      allowed: true,
      classification: "visual",
    });
    expect(classifyGeometryChange("constrained-point-move")).toMatchObject({
      allowed: false,
      classification: "mathematical",
    });
    expect(classifyGeometryChange("unknown")).toMatchObject({
      allowed: false,
      classification: "unknown",
    });

    const log = new InMemoryGeometryMovementExperimentLog();
    const command = movementMetadata("movement-event");
    recordGeometryMovementDecision(log, {
      commandId: command.id,
      importId,
      kind: "style-override",
      objectId: labelId,
      timestamp: command.timestamp,
    });
    expect(log.snapshot()).toEqual([
      expect.objectContaining({
        allowed: true,
        classification: "visual",
        importId,
        kind: "style-override",
        objectId: labelId,
      }),
    ]);
  });
});
