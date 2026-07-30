import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { boardObjectId, type PenStrokeObject } from "../core/public";
import { proposeSmartInkReplacement } from "../modules/smart-ink/public";
import { SmartInkDiagnosticsPanel } from "./SmartInkDiagnosticsPanel";

function lineStroke(): PenStrokeObject {
  return {
    groupId: null,
    id: boardObjectId("object:panel-line"),
    kind: "drawing.pen-stroke",
    locked: false,
    points: [
      { x: 0, y: 0 },
      { x: 60, y: 1 },
      { x: 120, y: 0 },
    ],
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#245d6b",
      strokeWidth: 3,
    },
    visible: true,
  };
}

describe("SmartInkDiagnosticsPanel", () => {
  it("shows recognition metrics after a Smart Ink evaluation", () => {
    render(<SmartInkDiagnosticsPanel />);

    expect(
      screen.getByText("Нарисуйте фигуру инструментом Smart Ink."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Экспортировать последний жест",
      }),
    ).toBeDisabled();

    act(() => {
      proposeSmartInkReplacement(lineStroke());
    });

    expect(screen.getByText("Распознано")).toBeInTheDocument();
    expect(screen.getByText("line", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("3 → 96")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Экспортировать последний жест",
      }),
    ).toBeEnabled();
  });
});
