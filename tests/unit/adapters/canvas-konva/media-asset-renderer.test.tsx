import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaAssetRenderer } from "../../../../src/adapters/canvas-konva/media-asset-renderer";
import { BoardMediaResourceScope } from "../../../../src/adapters/canvas-konva/board-media-resource-scope";
import { BoardMediaResourceScopeContext } from "../../../../src/adapters/canvas-konva/board-media-resource-context";
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

describe("F3.3.2-C access generation of visible raster images", () => {
  it("cancels an old decode and discards its late bitmap after permission refresh", async () => {
    const scope = new BoardMediaResourceScope("board:one");
    const close = vi.fn();
    let finishDecode!: (value: {
      close: () => void;
      height: number;
      width: number;
    }) => void;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finishDecode = resolve;
          }),
      ),
    );
    const loadBlob = vi.fn(() => Promise.resolve(new Blob([new Uint8Array([1])])));
    const source: BoardMediaContentSource = {
      cacheKey: "board:one:epoch:old",
      contentSha256: object.contentSha256,
      loadBlob,
      mimeType: object.mimeType,
      url: "https://board.example.test/image",
    };
    const view = render(
      <BoardMediaResourceScopeContext.Provider
        value={{ scope, resourceGeneration: 0, enabled: true }}
      >
        <MediaAssetRenderer object={object} source={source} zoom={1} />
      </BoardMediaResourceScopeContext.Provider>,
    );
    await waitFor(() => expect(finishDecode).toBeDefined());
    act(() => {
      scope.invalidate();
      view.rerender(
        <BoardMediaResourceScopeContext.Provider
          value={{
            scope,
            resourceGeneration: scope.identity.resourceGeneration,
            enabled: false,
          }}
        >
          <MediaAssetRenderer object={object} source={source} zoom={1} />
        </BoardMediaResourceScopeContext.Provider>,
      );
    });
    expect(scope.snapshot()).toMatchObject({
      activeLeases: 0,
      pendingLeases: 0,
      resourceGeneration: 1,
    });
    await act(async () => {
      finishDecode({ close, height: 64, width: 64 });
      await Promise.resolve();
    });
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("asset-konva-image")).toBeNull();
    expect(loadBlob).toHaveBeenCalledOnce();
    view.unmount();
    scope.dispose();
  });

  it("keeps a second board's completed image alive when the first board closes", async () => {
    const first = new BoardMediaResourceScope("board:first");
    const second = new BoardMediaResourceScope("board:second");
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn((blob: Blob) =>
        Promise.resolve({
          close: blob.size === 1 ? closeFirst : closeSecond,
          height: 64,
          width: 64,
        }),
      ),
    );
    const source = (boardId: string, bytes: number): BoardMediaContentSource => ({
      cacheKey: boardId + ":epoch:one",
      contentSha256: object.contentSha256,
      mimeType: object.mimeType,
      url: "https://board.example.test/image",
      loadBlob: () => Promise.resolve(new Blob([new Uint8Array(bytes)])),
    });
    const firstView = render(
      <BoardMediaResourceScopeContext.Provider
        value={{ scope: first, resourceGeneration: 0, enabled: true }}
      >
        <MediaAssetRenderer object={object} source={source("first", 1)} zoom={1} />
      </BoardMediaResourceScopeContext.Provider>,
    );
    const secondView = render(
      <BoardMediaResourceScopeContext.Provider
        value={{ scope: second, resourceGeneration: 0, enabled: true }}
      >
        <MediaAssetRenderer object={object} source={source("second", 2)} zoom={1} />
      </BoardMediaResourceScopeContext.Provider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("asset-konva-image")).toHaveLength(2));
    first.dispose();
    firstView.unmount();
    rasterDecodeCache.discardSourceWhenUnused("first:epoch:one");
    expect(closeFirst).toHaveBeenCalledOnce();
    expect(closeSecond).not.toHaveBeenCalled();
    expect(second.snapshot().activeLeases).toBe(1);
    secondView.unmount();
    second.dispose();
    rasterDecodeCache.discardSourceWhenUnused("second:epoch:one");
    expect(closeSecond).toHaveBeenCalledOnce();
  });
});
