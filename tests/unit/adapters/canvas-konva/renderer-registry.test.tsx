import { Rect } from "react-konva";
import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  svgSanitizerPolicyVersion,
  type BoardRenderItem,
  type BoardMediaContentSource,
  type MediaAssetObject,
  type RectangleObject,
} from "../../../../src/core/public";
import { MediaAssetRenderer } from "../../../../src/adapters/canvas-konva/media-asset-renderer";
import { MediaAssetPlaceholderRenderer } from "../../../../src/adapters/canvas-konva/media-asset-placeholder-renderer";
import { EmbeddedImageRenderer } from "../../../../src/adapters/canvas-konva/embedded-image-renderer";
import {
  createDefaultKonvaRendererRegistry,
  KonvaRendererRegistry,
  type KonvaObjectRenderer,
} from "../../../../src/adapters/canvas-konva/public";

const rectangle: RectangleObject = {
  id: boardObjectId("object:registry-test"),
  kind: "drawing.rectangle",
  groupId: null,
  locked: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  source: { kind: "user" },
  style: {
    fill: null,
    opacity: 1,
    stroke: "#000000",
    strokeWidth: 1,
  },
  visible: true,
  size: { height: 10, width: 10 },
};
const item: BoardRenderItem = { object: rectangle, transforms: [] };
const renderer: KonvaObjectRenderer = {
  kind: "drawing.rectangle",
  render: () => <Rect />,
};

describe("Konva renderer registry", () => {
  it("resolves a renderer by the stored object kind", () => {
    const registry = new KonvaRendererRegistry([renderer]);

    expect(registry.render(item).type).toBe(Rect);
  });


  it("registers the persisted SVG renderer", () => {
    const svgItem: BoardRenderItem = {
      object: {
        groupId: null,
        id: boardObjectId("object:svg-renderer"),
        kind: "svg-import.svg",
        locked: false,
        position: { x: 0, y: 0 },
        rotation: 0,
        sanitizedSvg:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
        sanitizerPolicyVersion: svgSanitizerPolicyVersion,
        scale: { x: 1, y: 1 },
        size: { height: 10, width: 10 },
        source: { kind: "user" },
        style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
        viewBox: { height: 10, width: 10, x: 0, y: 0 },
        visible: true,
      },
      transforms: [],
    };

    expect(() => createDefaultKonvaRendererRegistry().render(svgItem)).not.toThrow();
  });

  it("selects asset renderer only with a scoped resolver", () => {
    const object: MediaAssetObject = {
      ...rectangle,
      assetId: "asset:media-test",
      byteSize: 1024,
      contentSha256: "a".repeat(64),
      fileName: "lesson.png",
      intrinsicSize: { height: 24, width: 32 },
      kind: "media.asset",
      mimeType: "image/png",
    };
    const media: BoardRenderItem = { object, transforms: [] };
    const source: BoardMediaContentSource = {
      cacheKey: "scope:one:asset:media-test",
      contentSha256: object.contentSha256,
      mimeType: "image/png",
      url: "https://board.example.test/api/v1/boards/one/media/asset/content",
      loadBlob: async () => new Blob([new Uint8Array([1])]),
    };
    expect(createDefaultKonvaRendererRegistry().render(media).type).toBe(
      MediaAssetPlaceholderRenderer,
    );
    const registry = createDefaultKonvaRendererRegistry({
      mediaAssetSourceResolver: () => source,
    });
    const rendered = registry.render(media, { zoom: 2, visualScale: 1.5 });
    expect(rendered.type).toBe(MediaAssetRenderer);
    expect(rendered.props).toMatchObject({
      object,
      source,
      zoom: 2,
      visualScale: 1.5,
    });
    expect(registry.render({
      object: { ...object, mimeType: "video/mp4" },
      transforms: [],
    }).type).toBe(MediaAssetPlaceholderRenderer);
  });

  it("continues routing legacy embedded images through the existing renderer", () => {
    const object = {
      ...rectangle,
      contentSha256: "a".repeat(64),
      dataUrl: "data:image/png;base64,AA==",
      fileName: "legacy.png",
      intrinsicSize: { height: 1, width: 1 },
      kind: "image.embedded" as const,
      mimeType: "image/png" as const,
    };
    const rendered = createDefaultKonvaRendererRegistry().render({
      object,
      transforms: [],
    });
    expect(rendered.type).toBe(EmbeddedImageRenderer);
  });

  it("rejects duplicate registrations", () => {
    expect(() => new KonvaRendererRegistry([renderer, renderer])).toThrow(
      "Duplicate Konva renderer",
    );
  });

  it("fails explicitly when a renderer contribution is missing", () => {
    const registry = new KonvaRendererRegistry([]);

    expect(() => registry.render(item)).toThrow("Missing Konva renderer");
  });
});
