import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  boardObjectId,
  plotParameterId,
  plotSeriesId,
  type CoordinatePlotDefinition,
} from "../core/public";
import {
  createDefaultCoordinatePlotObject,
  validateCoordinatePlotEditorDefinition,
  type CoordinatePlotEditorIssue,
} from "../modules/coordinate-plot-editor/public";
import { CoordinatePlotEditorPanel } from "./CoordinatePlotEditorPanel";

afterEach(cleanup);

function createDefinition() {
  return createDefaultCoordinatePlotObject({
    center: { x: 320, y: 210 },
    ids: {
      objectId: boardObjectId("accessibility-panel-plot"),
      parameterId: () => plotParameterId("accessibility-panel-parameter"),
      seriesId: () => plotSeriesId("accessibility-panel-series"),
    },
  }).definition;
}

function renderPanel({
  definition = createDefinition(),
  dirty = true,
  issues = [],
  onClose = vi.fn<() => void>(),
  onSave = vi.fn<() => boolean>(() => true),
}: {
  readonly definition?: CoordinatePlotDefinition;
  readonly dirty?: boolean;
  readonly issues?: readonly CoordinatePlotEditorIssue[];
  readonly onClose?: () => void;
  readonly onSave?: () => boolean;
} = {}) {
  render(
    <CoordinatePlotEditorPanel
      definition={definition}
      dirty={dirty}
      issues={issues}
      onAddParameter={vi.fn()}
      onAddSeries={vi.fn()}
      onClose={onClose}
      onDefinitionChange={vi.fn<
        (definition: CoordinatePlotDefinition) => void
      >()}
      onSave={onSave}
      onSelectedSeriesChange={vi.fn()}
      readOnly={false}
      selectedSeriesId={plotSeriesId("accessibility-panel-series")}
    />,
  );
  return { onClose, onSave };
}

describe("CoordinatePlotEditorPanel accessibility and safety", () => {
  it("focuses the selected formula and restores the previous trigger", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open plot";
    document.body.append(trigger);
    trigger.focus();

    const { unmount } = render(
      <CoordinatePlotEditorPanel
        definition={createDefinition()}
        dirty={false}
        issues={[]}
        onAddParameter={vi.fn()}
        onAddSeries={vi.fn()}
        onClose={vi.fn()}
        onDefinitionChange={vi.fn()}
        onSave={vi.fn(() => true)}
        onSelectedSeriesChange={vi.fn()}
        readOnly={false}
        selectedSeriesId={plotSeriesId("accessibility-panel-series")}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Формула явной функции")).toHaveFocus(),
    );

    unmount();
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it("links field diagnostics with aria-invalid and aria-describedby", () => {
    renderPanel({
      issues: [
        {
          blocking: false,
          code: "expression.unknown-identifier",
          end: 1,
          field: "series.0.expression",
          message: "Неизвестный идентификатор q.",
          start: 0,
        },
      ],
    });

    const formula = screen.getByLabelText("Формула явной функции");
    expect(formula).toHaveAttribute("aria-invalid", "true");
    const issueId = formula.getAttribute("aria-describedby");
    expect(issueId).toBeTruthy();
    expect(document.getElementById(issueId ?? "")).toHaveTextContent(
      "Неизвестный идентификатор q.",
    );
  });

  it("links parameter diagnostics to name, range and step fields", () => {
    const definition: CoordinatePlotDefinition = {
      ...createDefinition(),
      parameters: [
        {
          id: plotParameterId("invalid-parameter"),
          max: -1,
          min: 1,
          name: "1bad",
          step: 0,
          value: 1,
        },
      ],
    };
    renderPanel({
      definition,
      issues: validateCoordinatePlotEditorDefinition(definition),
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Параметры (1)" }));
    const name = screen.getByLabelText("Имя параметра invalid-parameter");
    const minimum = screen.getByLabelText("Минимум");
    const maximum = screen.getByLabelText("Максимум");
    const step = screen.getByLabelText("Шаг");

    for (const field of [name, minimum, maximum, step]) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      const issueId = field.getAttribute("aria-describedby");
      expect(issueId).toBeTruthy();
      expect(document.getElementById(issueId ?? "")).not.toBeNull();
    }
  });

  it("protects a dirty draft and supports all close decisions", () => {
    const onClose = vi.fn();
    const onSave = vi.fn(() => true);
    renderPanel({ onClose, onSave });

    fireEvent.click(
      screen.getByRole("button", { name: "Закрыть редактор графика" }),
    );

    expect(
      screen.getByRole("alertdialog", {
        name: "Несохранённые изменения",
      }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Продолжить редактирование" }),
    );
    expect(
      screen.queryByRole("alertdialog", {
        name: "Несохранённые изменения",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить и закрыть" }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves with Ctrl+Enter and Meta+Enter from a formula field", async () => {
    const onSave = vi.fn(() => true);
    renderPanel({ onSave });

    const formula = screen.getByLabelText("Формула явной функции");
    await waitFor(() => expect(formula).toHaveFocus());

    fireEvent.keyDown(window, { ctrlKey: true, key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });

    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("gives icon-only buttons explicit accessible names", () => {
    renderPanel();

    expect(
      screen.getByRole("button", { name: "Закрыть редактор графика" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Расширенные настройки/ }),
    );
    expect(
      screen.getByRole("button", { name: "Удалить серию График 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Вернуться к базовым настройкам",
      }),
    ).toBeInTheDocument();
  });
});
