import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BoardSceneContent,
  type BoardSceneContentProps,
} from "../../../../src/adapters/canvas-konva/board-scene-content";
import {
  KonvaRendererRegistry,
  type KonvaRenderContext,
} from "../../../../src/adapters/canvas-konva/renderer-registry";
import {
  boardObjectId,
  type BoardObject,
  type BoardRenderItem,
} from "../../../../src/core/public";

afterEach(cleanup);

vi.mock("react-konva", () => ({
  Group: ({
    children,
    x = 0,
    y = 0,
  }: {
    readonly children?: ReactNode;
    readonly x?: number;
    readonly y?: number;
  }) => createElement("div", { "data-x": x, "data-y": y }, children),
}));

function item(index: number): BoardRenderItem {
  return {
    object: {
      groupId: null,
      id: boardObjectId(`object:scene:${index}`),
      kind: "drawing.text",
      locked: false,
      position: { x: index * 10, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: { fill: null, opacity: 1, stroke: "#17202a", strokeWidth: 2 },
      text: `Text ${index}`,
      visible: true,
    },
    transforms: [],
  };
}

function fixture(count = 500) {
  const renderObject = vi.fn(
    (object: BoardObject, context: KonvaRenderContext) => {
      if (object.kind !== "drawing.text")
        throw new Error("Expected text fixture");
      return createElement("span", { "data-zoom": context.zoom }, object.text);
    },
  );
  const props: BoardSceneContentProps = {
    batches: [Array.from({ length: count }, (_, index) => item(index))],
    lineEndpointPreview: null,
    registry: new KonvaRendererRegistry([
      { kind: "drawing.text", render: renderObject },
    ]),
    selectedObjectIds: [],
    selectionPreviewX: 0,
    selectionPreviewY: 0,
    zoom: 1,
  };
  return { props, renderObject };
}

describe("stable committed scene rendering", () => {
  it("does not regenerate 500 committed objects during 20 transient updates", () => {
    const { props, renderObject } = fixture();
    const view = render(<BoardSceneContent {...props} />);
    expect(renderObject).toHaveBeenCalledTimes(500);
    for (let frame = 0; frame < 20; frame += 1) {
      view.rerender(<BoardSceneContent {...props} />);
    }
    expect(renderObject).toHaveBeenCalledTimes(500);
  });

  it("updates changed content and zoom while reusing unrelated objects", () => {
    const { props, renderObject } = fixture(3);
    const view = render(<BoardSceneContent {...props} />);
    const original = props.batches[0]![1]!;
    if (original.object.kind !== "drawing.text")
      throw new Error("Expected text fixture");
    const changed = {
      ...original,
      object: { ...original.object, text: "Edited text" },
    };
    const batches = [[props.batches[0]![0]!, changed, props.batches[0]![2]!]];
    view.rerender(<BoardSceneContent {...props} batches={batches} />);
    expect(screen.getByText("Edited text")).toBeVisible();
    expect(renderObject).toHaveBeenCalledTimes(4);

    view.rerender(<BoardSceneContent {...props} batches={batches} zoom={2} />);
    expect(renderObject).toHaveBeenCalledTimes(7);
  });

  it("preserves order and live selection movement", () => {
    const { props } = fixture(3);
    const selectedId = props.batches[0]![1]!.object.id;
    const view = render(<BoardSceneContent {...props} />);
    view.rerender(
      <BoardSceneContent
        {...props}
        selectedObjectIds={[selectedId]}
        selectionPreviewX={30}
        selectionPreviewY={-15}
      />,
    );
    expect(
      screen.getAllByText(/^Text/u).map((element) => element.textContent),
    ).toEqual(["Text 0", "Text 1", "Text 2"]);
    expect(screen.getByText("Text 1").parentElement).toHaveAttribute(
      "data-x",
      "30",
    );
    expect(screen.getByText("Text 1").parentElement).toHaveAttribute(
      "data-y",
      "-15",
    );
    expect(screen.getByText("Text 0").parentElement).toHaveAttribute(
      "data-x",
      "0",
    );
  });

  it("updates group transforms and releases removed objects", () => {
    const { props, renderObject } = fixture(1);
    const original = props.batches[0]![0]!;
    const view = render(<BoardSceneContent {...props} />);
    view.rerender(
      <BoardSceneContent
        {...props}
        batches={[
          [
            {
              ...original,
              transforms: [
                {
                  rotation: 0,
                  scale: { x: 1, y: 1 },
                  translation: { x: 85, y: -30 },
                },
              ],
            },
          ],
        ]}
      />,
    );
    expect(screen.getByText("Text 0").parentElement).toHaveAttribute(
      "data-x",
      "85",
    );
    expect(screen.getByText("Text 0").parentElement).toHaveAttribute(
      "data-y",
      "-30",
    );
    expect(renderObject).toHaveBeenCalledTimes(2);
    view.rerender(<BoardSceneContent {...props} batches={[]} />);
    expect(screen.queryByText("Text 0")).not.toBeInTheDocument();
  });
});
