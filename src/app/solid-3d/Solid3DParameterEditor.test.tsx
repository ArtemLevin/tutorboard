import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  defaultSolidProjection,
  solid3DId,
  type Solid3DRecord,
} from "../../core/public";
import { Solid3DParameterEditor } from "./Solid3DParameterEditor";

function cylinderRecord(): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition: { height: 3, kind: "cylinder", radius: 2 },
    id: solid3DId("solid:parameter-editor"),
    points: [],
    projection: defaultSolidProjection,
    rootGroupId: "group:parameter-editor" as never,
    schemaVersion: "1.0",
    sections: [],
    source: { kind: "text-template", templateId: "cylinder" },
  };
}

describe("Solid3DParameterEditor", () => {
  it("commits a valid dimension once on blur", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    render(
      <Solid3DParameterEditor
        onRecordChange={onRecordChange}
        readOnly={false}
        record={cylinderRecord()}
      />,
    );
    const radius = screen.getByLabelText("Радиус");
    fireEvent.change(radius, { target: { value: "4" } });
    fireEvent.blur(radius);

    expect(onRecordChange).toHaveBeenCalledTimes(1);
    expect(onRecordChange.mock.calls[0]?.[0].definition).toEqual({
      height: 3,
      kind: "cylinder",
      radius: 4,
    });
  });

  it("rejects invalid dimensions without emitting a record", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    render(
      <Solid3DParameterEditor
        onRecordChange={onRecordChange}
        readOnly={false}
        record={cylinderRecord()}
      />,
    );
    const radius = screen.getByLabelText("Радиус");
    fireEvent.change(radius, { target: { value: "0" } });
    fireEvent.blur(radius);

    expect(onRecordChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Введите положительный допустимый размер.",
    );
  });

  it("disables every dimension input in read-only mode", () => {
    render(
      <Solid3DParameterEditor
        onRecordChange={vi.fn<(replacement: Solid3DRecord) => void>()}
        readOnly
        record={cylinderRecord()}
      />,
    );
    expect(screen.getByLabelText("Радиус")).toBeDisabled();
    expect(screen.getByLabelText("Высота")).toBeDisabled();
  });
});
