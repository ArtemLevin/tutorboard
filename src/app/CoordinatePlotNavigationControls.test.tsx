import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CoordinatePlotNavigationControls } from "./CoordinatePlotNavigationControls";

describe("CoordinatePlotNavigationControls", () => {
  it("exposes visible navigation actions and an accessible axis mode", () => {
    const onAxisChange = vi.fn();
    const onFit = vi.fn();
    const onReset = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();

    render(
      <CoordinatePlotNavigationControls
        axis="both"
        onAxisChange={onAxisChange}
        onFit={onFit}
        onReset={onReset}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />,
    );

    expect(
      screen.getByRole("toolbar", { name: "Навигация координатной плоскости" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Обе оси" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Приблизить график" }));
    fireEvent.click(screen.getByRole("button", { name: "Отдалить график" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Сбросить диапазон графика" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Вместить все графики" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Только ось X" }));

    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
    expect(onFit).toHaveBeenCalledOnce();
    expect(onAxisChange).toHaveBeenCalledWith("x");
  });
});
