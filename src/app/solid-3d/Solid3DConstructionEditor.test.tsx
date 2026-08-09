import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultSolidProjection,
  definitionForSolidConstruction,
  type Solid3DRecord,
} from "../../core/public";
import { Solid3DConstructionEditor } from "./Solid3DConstructionEditor";

const record = {
  boardObjectIds: [],
  definition: definitionForSolidConstruction("prism", 4),
  id: "solid:construction-ui",
  points: [],
  projection: defaultSolidProjection,
  rootGroupId: "group:construction-ui",
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "prism-4" },
} as Solid3DRecord;

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
