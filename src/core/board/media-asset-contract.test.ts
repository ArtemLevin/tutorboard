import { describe, expect, it } from "vitest";

import {
  boardDocument15SchemaVersion,
  createEmptyBoardDocument,
} from "./document";
import type { BoardDocument, BoardDocument15 } from "./document";
import { boardObjectId, documentId } from "./identifiers";
import { migrateBoardDocument14To15 } from "./migrations";
import {
  boardObjectKinds,
  boardObjectKinds15,
  embeddedImageMimeTypes,
  mediaAssetMimeTypes,
} from "./objects";
import type {
  EmbeddedImageObject,
  MediaAssetObject,
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

function invalidMediaDocument(patch: Record<string, unknown>): unknown {
  const base = mediaAsset();
  const object = { ...base, ...patch };
  return {
    ...document15With(base),
    objects: { [base.id]: object },
  };
}

describe("BoardDocument 1.5 media asset preparation", () => {
  it("keeps the active 1.4 object contract unchanged", () => {
    expect(boardObjectKinds).not.toContain("media.asset");
    expect(boardObjectKinds15).toEqual([...boardObjectKinds, "media.asset"]);
  });

  it("keeps image.embedded MIME support unchanged", () => {
    expect(embeddedImageMimeTypes).toEqual([
      "image/png",
      "image/jpeg",
      "image/svg+xml",
      "image/gif",
    ]);
  });

  it("defines the media.asset MIME allowlist", () => {
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

  for (const field of ["dataUrl", "storageKey", "url", "remoteUrl"]) {
    it(`rejects forbidden media transport field ${field}`, () => {
      expect(
        boardDocumentSchema15.safeParse(
          invalidMediaDocument({ [field]: "forbidden" }),
        ).success,
      ).toBe(false);
    });
  }

  it("rejects zero byte size", () => {
    expect(
      boardDocumentSchema15.safeParse(
        invalidMediaDocument({ byteSize: 0 }),
      ).success,
    ).toBe(false);
  });

  it("rejects fractional byte size", () => {
    expect(
      boardDocumentSchema15.safeParse(
        invalidMediaDocument({ byteSize: 1.5 }),
      ).success,
    ).toBe(false);
  });

  it("rejects unsafe byte size", () => {
    expect(
      boardDocumentSchema15.safeParse(
        invalidMediaDocument({
          byteSize: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects an unsafe asset identifier", () => {
    expect(
      boardDocumentSchema15.safeParse(
        invalidMediaDocument({ assetId: "../asset" }),
      ).success,
    ).toBe(false);
  });

  it("rejects an uppercase checksum", () => {
    expect(
      boardDocumentSchema15.safeParse(
        invalidMediaDocument({
          contentSha256: "A".repeat(64),
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects SVG as an external media asset", () => {
    expect(
      boardDocumentSchema15.safeParse(
        invalidMediaDocument({ mimeType: "image/svg+xml" }),
      ).success,
    ).toBe(false);
  });

  it("rejects oversized intrinsic dimensions", () => {
    expect(
      boardDocumentSchema15.safeParse(
        invalidMediaDocument({
          intrinsicSize: { height: 1, width: 16_385 },
        }),
      ).success,
    ).toBe(false);
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

  it("rejects migration of a semantically invalid 1.4 document", () => {
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
