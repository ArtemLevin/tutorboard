import { createHash, webcrypto } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { boardObjectId, type MediaAssetObject } from "../../../src/core/public";
import {
  embedBoardMediaForSnapshot,
  renderBoardSnapshotSvg,
  importTutorBoardDocument,
} from "../../../src/modules/document-transfer/public";
import frozenDocumentJson from "../../fixtures/board-document-1.0.json?raw";

const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8WQAAAAASUVORK5CYII=",
  "base64",
);
const sha = createHash("sha256").update(bytes).digest("hex");

function board(assets = 1) {
  const parsed = importTutorBoardDocument(frozenDocumentJson);
  if (parsed.status !== "ok") throw new Error("Invalid frozen test document");
  const objects = { ...parsed.document.objects };
  const order = [...parsed.document.order];
  for (let i = 0; i < assets; i += 1) {
    const id = boardObjectId("object:media-export-" + i);
    const asset: MediaAssetObject = {
      assetId: "asset:test-image",
      byteSize: bytes.length,
      contentSha256: sha,
      fileName: "sample.png",
      groupId: null,
      id,
      intrinsicSize: { width: 1, height: 1 },
      kind: "media.asset",
      locked: false,
      mimeType: "image/png",
      position: { x: i * 30, y: 15 },
      rotation: 10,
      scale: { x: 1, y: 1 },
      size: { width: 80, height: 70 },
      source: { kind: "user" },
      style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
      visible: true,
    };
    objects[id] = asset;
    order.push(id);
  }
  return { ...parsed.document, objects, order };
}

afterEach(() => vi.unstubAllGlobals());

describe("asset-backed snapshots", () => {
  it("includes authenticated verified image bytes, without changing the document", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const document = board(2);
    const load = vi.fn(async () => new Blob([bytes], { type: "image/png" }));
    const hydrated = await embedBoardMediaForSnapshot(document, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(document.objects[boardObjectId("object:media-export-0")]?.kind).toBe(
      "media.asset",
    );
    expect(hydrated.objects[boardObjectId("object:media-export-0")]?.kind).toBe(
      "image.embedded",
    );
    const svg = renderBoardSnapshotSvg(hydrated);
    expect(svg.match(/href="data:image\/png;base64,/gu)).toHaveLength(2);
    expect(svg).not.toContain("data-media-asset-id");
    expect(svg).not.toContain("sample.png");
  });

  it("blocks exporting media.asset when the authorized resolver is unavailable", async () => {
    await expect(embedBoardMediaForSnapshot(board(), undefined)).rejects.toThrow(
      "необходимо подключение",
    );
  });

  it("rejects a changed payload rather than exporting corrupt bytes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const corrupted = new Uint8Array(bytes);
    corrupted[corrupted.length - 1] ^= 1;
    await expect(
      embedBoardMediaForSnapshot(
        board(),
        async () => new Blob([corrupted], { type: "image/png" }),
      ),
    ).rejects.toThrow("Контрольная сумма");
  });

  it("rejects MIME mismatches rather than embedding untrusted data", async () => {
    await expect(
      embedBoardMediaForSnapshot(
        board(),
        async () => new Blob([bytes], { type: "text/html" }),
      ),
    ).rejects.toThrow("неверным типом");
  });

  it("leaves media-free legacy documents untouched", async () => {
    const document = board(0);
    const output = await embedBoardMediaForSnapshot(document, undefined);
    expect(output).toBe(document);
  });
});
