import { describe, expect, it } from "vitest";

import {
  boardDocument15SchemaVersion,
  createEmptyBoardDocument,
  type BoardDocument,
  type BoardDocument15,
} from "./document";
import { boardObjectId, documentId } from "./identifiers";
import { migrateBoardDocument14To15 } from "./migrations";
import {
  boardObjectKinds,
  boardObjectKinds15,
  embeddedImageMimeTypes,
  mediaAssetMimeTypes,
  type EmbeddedImageObject,
  type MediaAssetObject,
} from "./objects";
import {
  boardDocumentSchema,
  boardDocumentSchema15,
} from "./validation/schema";

const createdAt = "2026-09-30T00:00:00.000Z";

function emptyDocument(): BoardDocument {
  return createEmptyBoardDocument({
    createdAt,
    id: documentId("document:media-contract"),
    title: "Media contract",
  });
}

function objectBase(id: ReturnType<typeof boardObjectId>) {
  return {
    groupId: null,
    id,
    locked: false,
    position: { x: 10, y: 20 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" as const },
    style: {
      fill: null,
      opacity: 1,
      stroke: null,
      strokeWidth: 0,
    },
    visible: true,
  };
}

function mediaAsset(): MediaAssetObject {
  return {
    ...objectBase(boardObjectId("object:media-asset")),
    assetId: "asset:media-asset",
    byteSize: 24 * 1024 * 1024,
    contentSha256: "a".repeat(64),
    fileName: "lesson-animation.gif",
    intrinsicSize: { height: 1080, width: 1920 },
    kind: "media.asset",
    mimeType: "image/gif",
    size: { height: 360, width: 640 },
  };
}

function document15With(object: MediaAssetObject): BoardDocument15 {
  const current = emptyDocument();
  return {
    ...current,
    objects: { [object.id]: object },
    order: [object.id],
    schemaVersion: boardDocument15SchemaVersion,
  };
}

describe("BoardDocument 1.5 media asset preparation", () => {
  it("keeps the active 1.4 object contract unchanged while preparing 1.5", () => {
    expect(boardObjectKinds).not.toContain("media.asset");
    expect(boardObjectKinds15).toEqual([...boardObjectKinds, "media.asset"]);
    expect(embeddedImageMimeTypes).toEqual([
      "image/png",
      "image/jpeg",
      "image/svg+xml",
      "image/gif",
    ]);
    expect(mediaAssetMimeTypes).toEqual([
      "image/png",
      "image/jpeg",
      "image/gif",
      "video/mp4",
    ]);
  });

  it("accepts metadata-only media.asset in the prepared 1.5 schema", () => {
    const candidate = document15With(mediaAsset());

    expect(boardDocumentSchema15.safeParse(candidate).success).toBe(true);
    expect(
      boardDocumentSchema.safeParse({
        ...candidate,
        schemaVersion: "1.4",
      }).success,
    ).toBe(false);
  });

  it.each(["dataUrl", "storageKey", "url", "remoteUrl"])(
    "rejects forbidden media transport field %s",
    (field) => {
      const object = { ...mediaAsset(), [field]: "forbidden" };
      const candidate = {
        ...document15With(mediaAsset()),
        objects: { [object.id]: object },
      };

      expect(boardDocumentSchema15.safeParse(candidate).success).toBe(false);
    },
  );

  it.each([
    ["zero bytes", { byteSize: 0 }],
    ["fractional bytes", { byteSize: 1.5 }],
    ["unsafe byte count", { byteSize: Number.MAX_SAFE_INTEGER + 1 }],
    ["invalid asset id", { assetId: "../asset" }],
    ["uppercase checksum", { contentSha256: "A".repeat(64) }],
    ["unsupported SVG asset", { mimeType: "image/svg+xml" }],
    [
      "oversized intrinsic width",
      { intrinsicSize: { height: 1, width: 16_385 } },
    ],
  ])("rejects %s", (_label, patch) => {
    const object = { ...mediaAsset(), ...patch };
    const candidate = {
      ...document15With(mediaAsset()),
      objects: { [object.id]: object },
    };

    expect(boardDocumentSchema15.safeParse(candidate).success).toBe(false);
  });

  it("migrates 1.4 to 1.5 without changing image.embedded", () => {
    const object: EmbeddedImageObject = {
      ...objectBase(boardObjectId("object:embedded-image")),
      contentSha256: "b".repeat(64),
      dataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      fileName: "legacy.gif",
      intrinsicSize: { height: 1, width: 1 },
      kind: "image.embedded",
      mimeType: "image/gif",
      size: { height: 120, width: 120 },
    };
    const source: BoardDocument = {
      ...emptyDocument(),
      objects: { [object.id]: object },
      order: [object.id],
    };

    const migrated = migrateBoardDocument14To15(source);

    expect(migrated.ok).toBe(true);
    expect(source.schemaVersion).toBe("1.4");
    if (!migrated.ok) return;
    expect(migrated.document.schemaVersion).toBe("1.5");
    expect(migrated.document.objects[object.id]).toEqual(object);
    expect(
      boardDocumentSchema15.safeParse(migrated.document).success,
    ).toBe(true);
  });

  it("does not migrate a structurally valid but semantically invalid 1.4 document", () => {
    const object: EmbeddedImageObject = {
      ...objectBase(boardObjectId("object:orphan-image")),
      contentSha256: "c".repeat(64),
      dataUrl: "data:image/png;base64,AAAA",
      fileName: "orphan.png",
      intrinsicSize: { height: 1, width: 1 },
      kind: "image.embedded",
      mimeType: "image/png",
      size: { height: 1, width: 1 },
    };
    const invalid: BoardDocument = {
      ...emptyDocument(),
      objects: { [object.id]: object },
      order: [],
    };

    const migrated = migrateBoardDocument14To15(invalid);

    expect(migrated.ok).toBe(false);
  });
});
