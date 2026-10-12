import { cleanup, render } from "@testing-library/react";
import {
  createElement,
  useImperativeHandle,
  type ReactNode,
  type Ref,
} from "react";
import { afterEach, expect, it, vi } from "vitest";
import { BoardSceneContent } from "../../../../src/adapters/canvas-konva/board-scene-content";
import { KonvaRendererRegistry } from "../../../../src/adapters/canvas-konva/renderer-registry";
import {
  WheelInkCacheCoordinator,
  type WheelInkNode,
} from "../../../../src/adapters/canvas-konva/wheel-ink-cache";
import {
  boardObjectId,
  type BoardRenderItem,
} from "../../../../src/core/public";

const canvasCalls = vi.hoisted(() => ({ builds: 0, clears: 0 }));
vi.mock("react-konva", () => ({
  Group: ({
    children,
    ref,
  }: {
    children?: ReactNode;
    ref?: Ref<WheelInkNode>;
  }) => {
    useImperativeHandle(
      ref,
      () => ({
        cache() {
          canvasCalls.builds += 1;
        },
        clearCache() {
          canvasCalls.clears += 1;
        },
        getClientRect: () => ({ x: 0, y: 0, width: 600, height: 400 }),
        getLayer: () => ({ batchDraw() {} }),
      }),
      [],
    );
    return createElement("div", {}, children);
  },
}));
afterEach(() => {
  cleanup();
  canvasCalls.builds = 0;
  canvasCalls.clears = 0;
});

function fixture() {
  const items: BoardRenderItem[] = Array.from({ length: 81 }, (_, index) => ({
    transforms: [],
    object: {
      kind: "drawing.pen-stroke",
      id: boardObjectId(`object:cache-membership:${index}`),
      groupId: null,
      locked: false,
      visible: true,
      position: { x: index, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: { fill: null, opacity: 1, stroke: "#000000", strokeWidth: 2 },
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    },
  }));
  const coordinator = new WheelInkCacheCoordinator();
  const props = {
    batches: [items],
    lineEndpointPreview: null,
    registry: new KonvaRendererRegistry([
      { kind: "drawing.pen-stroke", render: () => createElement("span") },
    ]),
    selectedObjectIds: [],
    selectionPreviewX: 0,
    selectionPreviewY: 0,
    zoom: 1,
    wheelInkCache: coordinator,
  };
  return { items, coordinator, props };
}

it("releases an active cached scene/hit image when visible membership changes", () => {
  const { items, coordinator, props } = fixture();
  const view = render(<BoardSceneContent {...props} />);
  expect(coordinator.prepare()).toBe(true);
  coordinator.begin();
  expect(coordinator.cachedCount).toBe(1);
  view.rerender(
    <BoardSceneContent
      {...props}
      visibleObjectIds={new Set(items.slice(1).map((item) => item.object.id))}
    />,
  );
  expect(canvasCalls.clears).toBe(1);
  expect(coordinator.cachedCount).toBe(0);
  coordinator.end();
  expect(coordinator.prepare()).toBe(true);
  expect(canvasCalls.builds).toBe(2);
  view.unmount();
  expect(coordinator.cachedCount).toBe(0);
  expect(coordinator.canPrepare).toBe(false);
});

it("unregisters a run below the cache threshold and registers it after re-entry", () => {
  const { items, coordinator, props } = fixture();
  const view = render(<BoardSceneContent {...props} />);
  expect(coordinator.prepare()).toBe(true);
  view.rerender(
    <BoardSceneContent
      {...props}
      visibleObjectIds={new Set(items.slice(2).map((item) => item.object.id))}
    />,
  );
  expect(coordinator.cachedCount).toBe(0);
  expect(coordinator.prepare()).toBe(false);
  view.rerender(<BoardSceneContent {...props} />);
  expect(coordinator.prepare()).toBe(true);
  expect(canvasCalls.builds).toBe(2);
});
