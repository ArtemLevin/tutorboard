import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultSolidProjection,
  definitionForSolidConstruction,
  groupId,
  solid3DId,
  type Solid3DRecord,
} from "../../core/public";
import { Solid3DConstructionEditor } from "./Solid3DConstructionEditor";

const record: Solid3DRecord = {
  boardObjectIds: [],
  definition: definitionForSolidConstruction("prism", 4),
  id: solid3DId("solid:construction-ui"),
  points: [],
  projection: defaultSolidProjection,
  rootGroupId: groupId("group:construction-ui"),
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "prism-4" },
};

afterEach(cleanup);

describe("Solid3DConstructionEditor", () => {
  it("switches semantic body type transactionally", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    render(
      <Solid3DConstructionEditor
        onRecordChange={onRecordChange}
        readOnly={false}
        record={record}
      />,
    );
    fireEvent.change(screen.getByLabelText("Тип объёмного тела"), {
      target: { value: "icosahedron" },
    });
    expect(onRecordChange).toHaveBeenCalledTimes(1);
    expect(onRecordChange.mock.calls[0]?.[0].definition).toMatchObject({
      kind: "regular-polyhedron",
      variant: "icosahedron",
    });
  });

  it("edits regular side count and exposes custom base vertices", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    render(
      <Solid3DConstructionEditor
        onRecordChange={onRecordChange}
        readOnly={false}
        record={record}
      />,
    );
    const sides = screen.getByLabelText("Количество сторон основания");
    fireEvent.change(sides, { target: { value: "7" } });
    fireEvent.blur(sides);
    expect(onRecordChange.mock.calls[0]?.[0].definition).toMatchObject({
      kind: "prism",
    });
    fireEvent.click(screen.getByLabelText("Произвольное основание"));
    expect(screen.getByLabelText("X вершины 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ вершина" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Опустить вершину 1" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Опустить вершину 1" }));
  });

  it("warns that reconstruction clears saved annotations before applying it", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    const annotated: Solid3DRecord = {
      ...record,
      dihedralMeasurements: [
        { id: "solid-dihedral:old", faces: ["face:0", "face:2"] },
      ],
    };
    render(
      <Solid3DConstructionEditor
        onRecordChange={onRecordChange}
        readOnly={false}
        record={annotated}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "Изменение геометрии удалит сохранённые точки, сечения и измерения.",
    );
    fireEvent.change(screen.getByLabelText("Тип объёмного тела"), {
      target: { value: "tetrahedron" },
    });
    expect(onRecordChange).toHaveBeenCalledOnce();
    expect(onRecordChange.mock.calls[0]?.[0].dihedralMeasurements).toEqual([]);
  });

  it("locks all structural editing in read-only mode", () => {
    render(
      <Solid3DConstructionEditor
        onRecordChange={() => undefined}
        readOnly
        record={record}
      />,
    );
    expect(screen.getByLabelText("Тип объёмного тела")).toBeDisabled();
    expect(screen.getByLabelText("Количество сторон основания")).toBeDisabled();
    expect(screen.getByLabelText("Произвольное основание")).toBeDisabled();
  });
});
