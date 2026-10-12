import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useBoardMomentaryTool } from "./useBoardMomentaryTool";

function Harness({ readOnly }: { readonly readOnly: boolean }) {
  const tool = useBoardMomentaryTool("drawing.pen", false, readOnly);
  return (
    <>
      <input aria-label="Текст задачи" />
      <output data-testid="active-tool">{tool}</output>
    </>
  );
}

describe("useBoardMomentaryTool", () => {
  it("ignores editing targets and restores pan on key release", () => {
    render(<Harness readOnly={false} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { code: "Space" });
    expect(screen.getByTestId("active-tool")).toHaveTextContent("drawing.pen");
    fireEvent.keyDown(window, { code: "Space" });
    expect(screen.getByTestId("active-tool")).toHaveTextContent("navigation.pan");
    fireEvent.keyUp(window, { code: "Space" });
    expect(screen.getByTestId("active-tool")).toHaveTextContent("drawing.pen");
  });

  it("blocks erasing for guests and revokes a transient eraser when rights change", () => {
    const { rerender } = render(<Harness readOnly />);
    fireEvent.keyDown(window, { code: "KeyX", shiftKey: true });
    expect(screen.getByTestId("active-tool")).toHaveTextContent("drawing.pen");

    rerender(<Harness readOnly={false} />);
    fireEvent.keyDown(window, { code: "KeyX", shiftKey: true });
    expect(screen.getByTestId("active-tool")).toHaveTextContent("editing.eraser");

    rerender(<Harness readOnly />);
    expect(screen.getByTestId("active-tool")).toHaveTextContent("drawing.pen");
  });
});
