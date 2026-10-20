import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  resolveSolidPointAnchor,
  solid3DId,
  solidPointId,
  type Solid3DRecord,
  type SolidPointAnchor,
  type Vec3,
} from "../../core/public";
import { Solid3DEditorPanel } from "./Solid3DEditorPanel";

vi.mock("../../adapters/solid-3d-three/public", () => ({
  Solid3DViewport: (props: {
    record: Solid3DRecord;
    onPointDragStart?: (id: string) => void;
    onPointDragPreview?: (
      id: string,
      placement: { position: Vec3; anchor: SolidPointAnchor },
    ) => void;
    onPointDragEnd?: (
      id: string,
      placement: { position: Vec3; anchor: SolidPointAnchor } | null,
    ) => void;
  }) => {
    const point = props.record.points[0]!;
    const next = {
      anchor: {
        kind: "edge" as const,
        edgeId: point.anchor.kind === "edge" ? point.anchor.edgeId : "",
        parameter: 0.75,
      },
      position: point.position,
    };
    return (
      <div data-testid="drag-viewport">
        <span data-testid="drag-parameter">
          {point.anchor.kind === "edge" ? point.anchor.parameter : "?"}
        </span>
        <button onClick={() => props.onPointDragStart?.(point.id)}>
          Начать перетаскивание
        </button>
        <button onClick={() => props.onPointDragPreview?.(point.id, next)}>
          Переместить точку
        </button>
        <button onClick={() => props.onPointDragEnd?.(point.id, next)}>
          Отпустить точку
        </button>
        <button onClick={() => props.onPointDragEnd?.(point.id, null)}>
          Отменить перемещение
        </button>
      </div>
    );
  },
}));

const definition = { kind: "cube", edgeLength: 2 } as const;
const topology = createSolidTopology(definition)!;
const anchor: SolidPointAnchor = {
  kind: "edge",
  edgeId: topology.edges[0]!.id,
  parameter: 0.25,
};
const point = {
  id: solidPointId("solid-point:dragging"),
  label: "P",
  anchor,
  position: resolveSolidPointAnchor(topology, anchor)!,
};
const record: Solid3DRecord = {
  boardObjectIds: [],
  definition,
  id: solid3DId("solid:drag-component"),
  points: [point],
  projection: defaultSolidProjection,
  rootGroupId: "group:drag-component" as never,
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cube" },
};

afterEach(cleanup);

function renderPanel(readOnly = false) {
  const onPointMove = vi.fn();
  const onRecordChange = vi.fn();
  render(
    <Solid3DEditorPanel
      learningAttempt={null}
      learningAttempts={[]}
      learningEnabled={false}
      onClose={vi.fn()}
      onLearningAction={vi.fn()}
      onLearningComplete={vi.fn()}
      onLearningReset={vi.fn()}
      onLearningStart={vi.fn()}
      onProject={vi.fn()}
      onRecordChange={onRecordChange}
      onPointMove={onPointMove}
      onUndo={vi.fn()}
      readOnly={readOnly}
      record={record}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Поставить точку" }));
  return { onPointMove, onRecordChange };
}

describe("3D editor optimistic point drag", () => {
  it("previews without persistence and commits one move on release", () => {
    const { onPointMove, onRecordChange } = renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Начать перетаскивание" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Переместить точку" }));
    expect(screen.getByTestId("drag-parameter")).toHaveTextContent("0.75");
    expect(onPointMove).not.toHaveBeenCalled();
    expect(onRecordChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Отпустить точку" }));
    expect(onPointMove).toHaveBeenCalledTimes(1);
    expect(onPointMove).toHaveBeenCalledWith(
      record,
      point.id,
      resolveSolidPointAnchor(topology, {
        kind: "edge",
        edgeId: topology.edges[0]!.id,
        parameter: 0.75,
      }),
      expect.objectContaining({ kind: "edge", parameter: 0.75 }),
    );
    expect(screen.getByTestId("drag-parameter")).toHaveTextContent("0.25");
  });

  it("cancels a gesture without document commands", () => {
    const { onPointMove, onRecordChange } = renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Начать перетаскивание" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Переместить точку" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Отменить перемещение" }),
    );
    expect(screen.getByTestId("drag-parameter")).toHaveTextContent("0.25");
    expect(onPointMove).not.toHaveBeenCalled();
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("never commits when editing is read-only", () => {
    const { onPointMove } = renderPanel(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Начать перетаскивание" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Переместить точку" }));
    fireEvent.click(screen.getByRole("button", { name: "Отпустить точку" }));
    expect(onPointMove).not.toHaveBeenCalled();
  });
});
