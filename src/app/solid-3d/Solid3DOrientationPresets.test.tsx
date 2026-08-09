import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultSolidProjection,
  groupId,
  solid3DEulerDegreesFromQuaternion,
  solid3DId,
  solid3DModelQuaternion,
  type Solid3DRecord,
} from "../../core/public";
import { Solid3DOrientationEditor } from "./Solid3DOrientationEditor";

const record: Solid3DRecord = {
  boardObjectIds: [],
  definition: { edgeLength: 2, kind: "cube" },
  id: solid3DId("solid:orientation-presets"),
  points: [],
  projection: defaultSolidProjection,
  rootGroupId: groupId("group:orientation-presets"),
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cube" },
};

afterEach(cleanup);

describe("Solid3DOrientationEditor presets", () => {
  it("commits a 180 degree preset for the selected axis", () => {
    const onRecordChange = vi.fn<(replacement: Solid3DRecord) => void>();
    render(
      <Solid3DOrientationEditor
        onRecordChange={onRecordChange}
        readOnly={false}
        record={record}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "180°" })[1]!);
    expect(onRecordChange).toHaveBeenCalledTimes(1);
    const replacement = onRecordChange.mock.calls[0]?.[0];
    expect(replacement).toBeDefined();
    if (replacement === undefined) return;
    const euler = solid3DEulerDegreesFromQuaternion(
      solid3DModelQuaternion(replacement),
    );
    expect(Math.abs(euler.y)).toBeCloseTo(0, 8);
    expect(Math.abs(euler.x)).toBeCloseTo(180, 8);
  });
});
