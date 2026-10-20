import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  resolveSolidPointAnchor,
  solid3DId,
  solidPointId,
  type Solid3DPoint,
  type Solid3DRecord,
  type SolidSectionResult,
} from "../../core/public";
import { Solid3DEditorPanel } from "./Solid3DEditorPanel";

vi.mock("../../adapters/solid-3d-three/public", () => ({
  Solid3DViewport: (props: { section: SolidSectionResult | null }) => (
    <div data-testid="mock-sweep-section">
      {props.section?.vertices[0]?.y.toFixed(2) ?? "none"}
    </div>
  ),
}));

const definition = { kind: "cube", edgeLength: 2 } as const;
const topology = createSolidTopology(definition)!;
const vertexMap = new Map(
  topology.vertices.map(({ id, position }) => [id, position]),
);
const points: Solid3DPoint[] = topology.edges
  .filter(
    ({ startVertexId, endVertexId }) =>
      Math.abs(
        vertexMap.get(startVertexId)!.y - vertexMap.get(endVertexId)!.y,
      ) > 1.5,
  )
  .slice(0, 3)
  .map((edge, index) => {
    const anchor = { kind: "edge" as const, edgeId: edge.id, parameter: 0.5 };
    return {
      anchor,
      id: solidPointId(`solid-point:ui-sweep:${index}`),
      label: `A${index}`,
      position: resolveSolidPointAnchor(topology, anchor)!,
    };
  });
const record: Solid3DRecord = {
  boardObjectIds: [],
  definition,
  id: solid3DId("solid:ui-sweep"),
  points,
  projection: defaultSolidProjection,
  rootGroupId: "group:ui-sweep" as never,
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cube" },
};

afterEach(cleanup);

function renderSweep(readOnly = false) {
  const onSaveSweep = vi.fn(() => ({
    sectionId: "solid-section:captured",
    pointIds: [points[0]!.id, points[1]!.id, points[2]!.id] as const,
  }));
  const onRecordChange = vi.fn();
  const onSaveRotation = vi.fn(() => ({
    sectionId: "solid-section:rotated",
    pointIds: [points[0]!.id, points[1]!.id, points[2]!.id] as const,
  }));
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
      onPointMove={vi.fn()}
      onRecordChange={onRecordChange}
      onSaveSweep={onSaveSweep}
      onSaveRotation={onSaveRotation}
      onUndo={vi.fn()}
      readOnly={readOnly}
      record={record}
    />,
  );
  return { onSaveSweep, onSaveRotation, onRecordChange };
}

describe("3D parallel section sweep UI", () => {
  it("updates the live WebGL section without persisting until explicitly saved", () => {
    const { onSaveSweep, onRecordChange } = renderSweep();
    expect(screen.getByTestId("mock-sweep-section")).toHaveTextContent("0.00");
    fireEvent.click(
      screen.getByLabelText("Параллельное перемещение плоскости"),
    );
    fireEvent.change(
      screen.getByRole("slider", { name: "Смещение секущей плоскости" }),
      {
        target: { value: "0.5" },
      },
    );
    expect(screen.getByTestId("mock-sweep-section")).not.toHaveTextContent(
      "0.00",
    );
    expect(onSaveSweep).not.toHaveBeenCalled();
    expect(onRecordChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить положение плоскости" }),
    );
    expect(onSaveSweep).toHaveBeenCalledTimes(1);
    expect(onSaveSweep).toHaveBeenCalledWith(
      record,
      points.map(({ id }) => id),
      0.5,
      expect.any(String),
    );
  });

  it("keeps live exploration available in read-only mode while blocking commits", () => {
    const { onSaveSweep } = renderSweep(true);
    fireEvent.click(
      screen.getByLabelText("Параллельное перемещение плоскости"),
    );
    fireEvent.change(
      screen.getByRole("slider", { name: "Смещение секущей плоскости" }),
      {
        target: { value: "0.5" },
      },
    );
    expect(
      screen.getByRole("button", { name: "Сохранить положение плоскости" }),
    ).toBeDisabled();
    expect(onSaveSweep).not.toHaveBeenCalled();
  });
});

describe("3D section rotation UI", () => {
  const horizontalEdge = topology.edges.find((edge) => {
    const a = vertexMap.get(edge.startVertexId)!;
    const b = vertexMap.get(edge.endVertexId)!;
    return Math.abs(a.x - b.x) > 1.5 && a.y === -1;
  })!;

  it("previews rotated geometry and commits only on explicit save", () => {
    const { onSaveRotation, onSaveSweep, onRecordChange } = renderSweep();
    fireEvent.click(screen.getByLabelText("Вращать плоскость вокруг ребра"));
    fireEvent.change(screen.getByLabelText("Ось вращения"), {
      target: { value: horizontalEdge.id },
    });
    fireEvent.change(
      screen.getByRole("slider", {
        name: "Угол поворота секущей плоскости",
      }),
      {
        target: { value: "15" },
      },
    );
    expect(screen.getByTestId("mock-sweep-section")).not.toHaveTextContent(
      "0.00",
    );
    expect(onSaveRotation).not.toHaveBeenCalled();
    expect(onSaveSweep).not.toHaveBeenCalled();
    expect(onRecordChange).not.toHaveBeenCalled();
    const saveButton = screen.getByRole("button", {
      name: "Сохранить повёрнутое сечение",
    });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);
    expect(onSaveRotation).toHaveBeenCalledTimes(1);
    expect(onSaveRotation).toHaveBeenCalledWith(
      record,
      points.map(({ id }) => id),
      horizontalEdge.id,
      15,
      expect.any(String),
    );
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("supports precise angle controls, clamps range, and excludes parallel sweep", () => {
    renderSweep();
    fireEvent.click(
      screen.getByLabelText("Параллельное перемещение плоскости"),
    );
    expect(
      screen.getByRole("slider", {
        name: "Смещение секущей плоскости",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Вращать плоскость вокруг ребра"));
    expect(
      screen.queryByRole("slider", {
        name: "Смещение секущей плоскости",
      }),
    ).not.toBeInTheDocument();
    const exact = screen.getByLabelText("Точный угол, градусы");
    fireEvent.change(exact, { target: { value: "12.5" } });
    expect(
      screen.getByRole("slider", {
        name: "Угол поворота секущей плоскости",
      }),
    ).toHaveValue("12.5");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Изменить угол на +15°",
      }),
    );
    expect(exact).toHaveValue(27.5);
    fireEvent.change(exact, { target: { value: "200" } });
    expect(exact).toHaveValue(180);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Изменить угол на -5°",
      }),
    );
    expect(exact).toHaveValue(175);
  });

  it("permits read-only exploration while prohibiting persistence", () => {
    const { onSaveRotation } = renderSweep(true);
    fireEvent.click(screen.getByLabelText("Вращать плоскость вокруг ребра"));
    fireEvent.change(screen.getByLabelText("Ось вращения"), {
      target: { value: horizontalEdge.id },
    });
    fireEvent.change(
      screen.getByRole("slider", {
        name: "Угол поворота секущей плоскости",
      }),
      {
        target: { value: "15" },
      },
    );
    expect(
      screen.getByRole("button", {
        name: "Сохранить повёрнутое сечение",
      }),
    ).toBeDisabled();
    expect(onSaveRotation).not.toHaveBeenCalled();
  });
});
