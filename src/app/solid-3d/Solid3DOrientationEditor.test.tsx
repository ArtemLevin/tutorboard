import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultSolidProjection,
  solid3DEulerDegreesFromQuaternion,
  solid3DModelQuaternion,
  type Solid3DRecord,
} from "../../core/public";
import { Solid3DOrientationEditor } from "./Solid3DOrientationEditor";

const record = {
  boardObjectIds: [],
  definition: { edgeLength: 2, kind: "cube" },
  id: "solid:orientation",
  points: [],
  projection: defaultSolidProjection,
  rootGroupId: "group:orientation",
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cube" },
} as Solid3DRecord;

afterEach(cleanup);

describe("Solid3DOrientationEditor", () => {
  it("commits one axis on blur", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    render(
      <Solid3DOrientationEditor
        onRecordChange={onRecordChange}
        readOnly={false}
        record={record}
      />,
    );
    const input = screen.getByLabelText("Поворот X");
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.blur(input);
    expect(onRecordChange).toHaveBeenCalledTimes(1);
    const replacement = onRecordChange.mock.calls[0]?.[0];
    expect(replacement).toBeDefined();
    if (replacement === undefined) return;
    const euler = solid3DEulerDegreesFromQuaternion(
      solid3DModelQuaternion(replacement),
    );
    expect(euler.x).toBeCloseTo(45, 8);
  });

  it("supports quick 15 degree rotation and reset", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    render(
      <Solid3DOrientationEditor
        onRecordChange={onRecordChange}
        readOnly={false}
        record={record}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "+15°" })[1]!);
    expect(onRecordChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
    expect(onRecordChange).toHaveBeenCalledTimes(2);
  });

  it("disables orientation changes in read-only mode", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    render(
      <Solid3DOrientationEditor
        onRecordChange={onRecordChange}
        readOnly
        record={record}
      />,
    );
    expect(screen.getByLabelText("Поворот X")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сбросить" })).toBeDisabled();
  });
});
