import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";

import type { CoordinatePlotZoomAxis } from "../adapters/canvas-konva/public";
import "./CoordinatePlotNavigationControls.css";

const axisOptions: readonly {
  readonly axis: CoordinatePlotZoomAxis;
  readonly label: string;
  readonly shortLabel: string;
}[] = [
  { axis: "both", label: "Обе оси", shortLabel: "XY" },
  { axis: "x", label: "Только ось X", shortLabel: "X" },
  { axis: "y", label: "Только ось Y", shortLabel: "Y" },
];

export interface CoordinatePlotNavigationControlsProps {
  readonly axis: CoordinatePlotZoomAxis;
  readonly onAxisChange: (axis: CoordinatePlotZoomAxis) => void;
  readonly onFit: () => void;
  readonly onReset: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
}

function focusAxisButton(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  index: number,
): void {
  const buttons =
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    );
  buttons?.item(index).focus();
}

export function CoordinatePlotNavigationControls({
  axis,
  onAxisChange,
  onFit,
  onReset,
  onZoomIn,
  onZoomOut,
}: CoordinatePlotNavigationControlsProps): ReactElement {
  const stopPointerPropagation = (event: ReactPointerEvent<HTMLElement>) =>
    event.stopPropagation();
  const handleAxisKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const last = axisOptions.length - 1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (index + 1) % axisOptions.length
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? (index - 1 + axisOptions.length) % axisOptions.length
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    onAxisChange(axisOptions[nextIndex]!.axis);
    focusAxisButton(event, nextIndex);
  };

  return (
    <div
      aria-label="Навигация координатной плоскости"
      className="coordinate-plot-navigation"
      data-testid="coordinate-plot-navigation"
      onPointerDown={stopPointerPropagation}
      role="toolbar"
    >
      <div
        aria-label="Масштаб графика"
        className="plot-navigation-actions"
        role="group"
      >
        <button
          aria-label="Приблизить график"
          onClick={onZoomIn}
          title="Приблизить"
          type="button"
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          aria-label="Отдалить график"
          onClick={onZoomOut}
          title="Отдалить"
          type="button"
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          aria-label="Сбросить диапазон графика"
          onClick={onReset}
          type="button"
        >
          Сброс
        </button>
        <button aria-label="Вместить все графики" onClick={onFit} type="button">
          Вместить
        </button>
      </div>
      <div
        aria-label="Ось масштабирования"
        className="plot-navigation-axis"
        role="radiogroup"
      >
        {axisOptions.map((option, index) => (
          <button
            aria-checked={axis === option.axis}
            aria-label={option.label}
            className={axis === option.axis ? "is-active" : undefined}
            key={option.axis}
            onClick={() => onAxisChange(option.axis)}
            onKeyDown={(event) => handleAxisKeyDown(event, index)}
            role="radio"
            tabIndex={axis === option.axis ? 0 : -1}
            type="button"
          >
            {option.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
