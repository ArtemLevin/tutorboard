import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaAssetRenderer } from "../../../../src/adapters/canvas-konva/media-asset-renderer";
import { rasterDecodeCache } from "../../../../src/adapters/canvas-konva/raster-decode-cache";
import {
  boardObjectId,
  type BoardMediaContentSource,
  type MediaAssetObject,
} from "../../../../src/core/public";

vi.mock("react-konva", () => ({
  Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Image: ({ image }: { image: { width: number } }) => (
    <div data-testid="asset-konva-image" data-width={image.width} />
  ),
  Rect: () => <div data-testid="asset-konva-placeholder" />,
}));

const object: MediaAssetObject = {
  assetId: "asset:render-test",
  byteSize: 4,
  contentSha256: "a".repeat(64),
  fileName: "example.png",
  groupId: null,
  id: boardObjectId("object:asset-render-test"),
  intrinsicSize: { height: 64, width: 64 },
  kind: "media.asset",
  locked: false,
  mimeType: "image/png",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  size: { height: 64, width: 64 },
  source: { kind: "user" },
  style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
  visible: true,
};

describe("MediaAssetRenderer", () => {
  beforeEach(() => rasterDecodeCache.clear());
  afterEach(() => {
    cleanup();
    rasterDecodeCache.trimUnused();
    vi.unstubAllGlobals();
  });

  it("renders asset PNG and releases bitmap on unmount", async () => {
    const close = vi.fn();
    const bitmap = { close, height: 64, width: 64 };
    const decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", decode);
    const loadBlob = vi.fn().mockResolvedValue(
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    );
    const media: BoardMediaContentSource = {
      cacheKey: "scope:board:asset:render",
      contentSha256: object.contentSha256,
      loadBlob,
      mimeType: "image/png",
      url: "https://board.example.test/api/v1/boards/one/media/asset/content",
    };
    const view = render(
      <MediaAssetRenderer object={object} source={media} zoom={1} />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("asset-konva-image")).not.toBeNull(),
    );
    expect(loadBlob).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledOnce();
    expect(
      screen.getByTestId("asset-konva-image").getAttribute("data-width"),
    ).toBe("64");
    view.unmount();
    rasterDecodeCache.trimUnused();
    expect(close).toHaveBeenCalledOnce();
  });
});
