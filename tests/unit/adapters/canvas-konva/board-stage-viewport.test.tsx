import { act, cleanup, render } from "@testing-library/react";
import { createElement, useLayoutEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BoardStage,
  type BoardStageProps,
} from "../../../../src/adapters/canvas-konva/BoardStage";
import { KonvaRendererRegistry } from "../../../../src/adapters/canvas-konva/renderer-registry";
import type { ViewportState } from "../../../../src/core/public";

const canvas = vi.hoisted(() => ({
  wheel: (delta: number) => {
    void delta;
  },
}));
// Replace only canvas host nodes. BoardStage's actual gesture, timer and
// authoritative-viewport effects run together through React.
vi.mock("react-konva", () => {
  const host = ({ children }: { children?: ReactNode }) =>
    createElement("div", {}, children);
  return {
    Circle: host,
    Group: host,
    Layer: host,
    Line: host,
    Rect: host,
    Text: host,
    Transformer: host,
    Stage: ({
      children,
      onWheel,
    }: {
      children?: ReactNode;
      onWheel: (event: {
        evt: WheelEvent;
        target: {
          getStage(): { getPointerPosition(): { x: number; y: number } };
        };
      }) => void;
    }) => {
      useLayoutEffect(() => {
        canvas.wheel = (deltaY) =>
          onWheel({
            evt: new WheelEvent("wheel", { deltaY, cancelable: true }),
            target: {
              getStage: () => ({
                getPointerPosition: () => ({ x: 100, y: 80 }),
              }),
            },
          });
      });
      return createElement("div", {}, children);
    },
  };
});
vi.mock("../../../../src/adapters/canvas-konva/use-element-size", () => ({
  useElementSize: () => ({ width: 800, height: 600 }),
}));

function fixture() {
  const commits: ViewportState[] = [];
  const initial = { zoom: 1, offset: { x: 0, y: 0 } };
  const props: BoardStageProps = {
    drawingModeKey: null,
    selectionModeKey: null,
    panMode: false,
    registry: new KonvaRendererRegistry([]),
    scene: { items: [], viewport: initial },
    onViewportCommit: (viewport) => {
      // Mirror the current reducer's strict Zod-owned snapshot: ACK identity
      // differs from the wheel input while preserving the exact camera.
      const accepted = {
        zoom: viewport.zoom,
        offset: { ...viewport.offset },
      };
      commits.push(accepted);
      return accepted;
    },
    onWorldPointerCancel: vi.fn(),
    onWorldPointerFinish: vi.fn(),
    onWorldPointerMove: vi.fn(),
    onWorldPointerStart: vi.fn(),
    onSelectionPointerCancel: vi.fn(),
    onSelectionPointerFinish: vi.fn(),
    onSelectionPointerMove: vi.fn(),
    onSelectionPointerStart: vi.fn(),
  };
  return { commits, initial, props };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("wheel viewport continuity across React scheduling", () => {
  it("accumulates an input arriving after debounce but before the next render", () => {
    const { commits, props } = fixture();
    render(<BoardStage {...props} />);
    act(() => {
      canvas.wheel(-190);
      vi.advanceTimersByTime(120);
      canvas.wheel(190);
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(commits).toHaveLength(2);
    expect(commits[0]?.zoom).toBeCloseTo(1.08, 12);
    expect(commits[1]?.zoom).toBeCloseTo(1, 12);
    expect(commits[1]?.offset.x).toBeCloseTo(0, 10);
    expect(commits[1]?.offset.y).toBeCloseTo(0, 10);
  });

  it("keeps the new wheel session when the previous local commit is acknowledged", () => {
    const { commits, props } = fixture();
    const view = render(<BoardStage {...props} />);
    act(() => canvas.wheel(-190));
    act(() => {
      vi.advanceTimersByTime(120);
    });
    const acknowledged = commits[0]!;
    act(() => canvas.wheel(190));
    view.rerender(
      <BoardStage
        {...props}
        scene={{ ...props.scene, viewport: acknowledged }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(commits).toHaveLength(2);
    expect(commits[1]?.zoom).toBeCloseTo(1, 12);
  });

  it("cancels the pending gesture on an external viewport replacement", () => {
    const { commits, props } = fixture();
    const view = render(<BoardStage {...props} />);
    act(() => canvas.wheel(-190));
    const external = { zoom: 2, offset: { x: 40, y: 30 } };
    view.rerender(
      <BoardStage {...props} scene={{ ...props.scene, viewport: external }} />,
    );
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(commits).toHaveLength(0);
    act(() => canvas.wheel(-190));
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(commits[0]?.zoom).toBeCloseTo(2.16, 12);
  });

  it("treats equal coordinates from a separate object as an external reset", () => {
    const { commits, props } = fixture();
    const view = render(<BoardStage {...props} />);
    act(() => canvas.wheel(-190));
    act(() => {
      vi.advanceTimersByTime(120);
    });
    const external = { ...commits[0]!, offset: { ...commits[0]!.offset } };
    act(() => canvas.wheel(190));
    view.rerender(
      <BoardStage {...props} scene={{ ...props.scene, viewport: external }} />,
    );
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(commits).toHaveLength(1);
    expect(view.getByTestId("board-stage")).toHaveAttribute(
      "data-preview-zoom",
      "1.08",
    );
  });

  it("consumes local acknowledgement ownership before a later restore", () => {
    const { commits, props } = fixture();
    const view = render(<BoardStage {...props} />);
    act(() => canvas.wheel(-190));
    act(() => {
      vi.advanceTimersByTime(120);
    });
    const first = commits[0]!;
    view.rerender(
      <BoardStage {...props} scene={{ ...props.scene, viewport: first }} />,
    );
    act(() => canvas.wheel(190));
    act(() => {
      vi.advanceTimersByTime(120);
    });
    view.rerender(
      <BoardStage
        {...props}
        scene={{ ...props.scene, viewport: commits[1]! }}
      />,
    );
    // Restoring an already acknowledged object is authoritative again.
    view.rerender(
      <BoardStage {...props} scene={{ ...props.scene, viewport: first }} />,
    );
    expect(view.getByTestId("board-stage")).toHaveAttribute(
      "data-preview-zoom",
      "1.08",
    );
  });
});
