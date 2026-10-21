import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultSolidProjection,
  definitionForSolidConstruction,
  groupId,
  solid3DId,
  type Solid3DRecord,
} from "../../core/public";
import { Solid3DEditorPanel } from "./Solid3DEditorPanel";

vi.mock("../../adapters/solid-3d-three/public", () => ({
  Solid3DViewport: (props: {
    showRotationGizmo?: boolean;
    mode?: string;
    onMeasurementPick?: (point: { kind: "vertex"; id: string }) => void;
    measurementPreview?: readonly unknown[] | null;
  }) => (
    <div
      data-testid="mock-3d-viewport"
      data-rotation-gizmo={String(props.showRotationGizmo ?? false)}
      data-viewport-mode={props.mode}
      data-measure-preview={String(props.measurementPreview != null)}
    >
      <button
        onClick={() => props.onMeasurementPick?.({ kind: "vertex", id: "vertex:0" })}
        type="button"
      >Выбрать начало на модели</button>
      <button
        onClick={() => props.onMeasurementPick?.({ kind: "vertex", id: "vertex:1" })}
        type="button"
      >Выбрать конец на модели</button>
    </div>
  ),
}));

const record: Solid3DRecord = {
  boardObjectIds: [],
  definition: definitionForSolidConstruction("prism", 4),
  id: solid3DId("solid:embedded-panel"),
  points: [],
  projection: defaultSolidProjection,
  rootGroupId: groupId("group:embedded-panel"),
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "prism-4" },
};

afterEach(cleanup);

function renderPanel({
  onClose = vi.fn(),
  readOnly = false,
  onRecordChange = vi.fn(),
  initialRecord = record,
}: {
  readonly onClose?: () => void;
  readonly readOnly?: boolean;
  readonly onRecordChange?: (replacement: Solid3DRecord) => void;
  readonly initialRecord?: Solid3DRecord;
} = {}) {
  const onOutsideClick = vi.fn();
  const view = render(
    <div onKeyDown={onOutsideClick}>
      <button onClick={onOutsideClick} type="button">
        Действие на доске
      </button>
      <Solid3DEditorPanel
        learningAttempt={null}
        learningAttempts={[]}
        learningEnabled={false}
        onClose={onClose}
        onLearningAction={vi.fn()}
        onLearningComplete={vi.fn()}
        onLearningReset={vi.fn()}
        onLearningStart={vi.fn()}
        onProject={vi.fn()}
        onRecordChange={onRecordChange}
        onPointMove={vi.fn()}
        onSaveSweep={vi.fn()}
        onSaveRotation={vi.fn()}
        onUndo={vi.fn()}
        readOnly={readOnly}
        record={initialRecord}
      />
    </div>,
  );
  return { ...view, onClose, onOutsideClick };
}

describe("Solid3DEditorPanel embedded workspace", () => {
  it("opens as a non-modal region and leaves the board interactive", () => {
    const { onClose, onOutsideClick } = renderPanel();
    const panel = screen.getByRole("region", { name: "Призма" });
    expect(panel).toHaveAttribute("data-testid", "solid-3d-editor");
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(panel.parentElement).toHaveClass("solid-3d-dock");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Действие на доске" }));
    expect(onOutsideClick).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(panel).toBeInTheDocument();
  });

  it("keeps RGB rotation rings hidden until requested and hides them in point mode", () => {
    renderPanel();
    const viewport = screen.getByTestId("mock-3d-viewport");
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    const show = screen.getByRole("button", {
      name: "Показать кольца поворота",
    });
    expect(show).toHaveAttribute("aria-pressed", "false");
    expect(viewport).toHaveAttribute("data-rotation-gizmo", "false");

    fireEvent.click(show);
    const hide = screen.getByRole("button", { name: "Скрыть кольца поворота" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    expect(viewport).toHaveAttribute("data-rotation-gizmo", "true");

    fireEvent.click(screen.getByRole("button", { name: "Поставить точку" }));
    expect(viewport).toHaveAttribute("data-rotation-gizmo", "false");
    expect(
      screen.getByRole("button", { name: "Показать кольца поворота" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Исследование" }));
    expect(viewport).toHaveAttribute("data-rotation-gizmo", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Скрыть кольца поворота" }),
    );
    expect(viewport).toHaveAttribute("data-rotation-gizmo", "false");
    expect(screen.getByTestId("mock-3d-viewport")).toBe(viewport);
  });

  it("reveals advanced settings and section tools only when requested", () => {
    renderPanel();
    const viewport = screen.getByTestId("mock-3d-viewport");
    expect(
      screen.getByRole("button", { name: "Исследование" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Тип объёмного тела")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Точная настройка" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Создать сечение" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Сечение" }));
    expect(viewport).toHaveAttribute("data-viewport-mode", "points");
    expect(
      screen.getByRole("button", { name: "Создать сечение" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    expect(
      screen.getByRole("region", { name: "Точная настройка" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Поворот X")).toBeInTheDocument();
    expect(screen.getByTestId("mock-3d-viewport")).toBe(viewport);
    fireEvent.keyDown(screen.getByRole("region", { name: "Призма" }), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("region", { name: "Точная настройка" }),
    ).toBeNull();
    expect(screen.getByTestId("mock-3d-viewport")).toBe(viewport);
  });

  it("measures two vertices directly on the model, previews and saves", () => {
    const onRecordChange = vi.fn();
    renderPanel({ onRecordChange });
    const viewport = screen.getByTestId("mock-3d-viewport");
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    expect(screen.getByRole("button", { name: "Измерить" })).toHaveAttribute(
      "aria-pressed", "true",
    );
    expect(viewport).toHaveAttribute("data-measure-preview", "false");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать начало на модели" }));
    expect(screen.getByText("Выберите вторую точку")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выбрать конец на модели" }));
    expect(viewport).toHaveAttribute("data-measure-preview", "true");
    expect(screen.getByText(/Длина:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить измерение" }));
    expect(onRecordChange).toHaveBeenCalledOnce();
    const saved = onRecordChange.mock.calls[0]?.[0] as Solid3DRecord;
    expect(saved.measurements).toHaveLength(1);
    expect(saved.measurements?.[0]?.first.id).toBe("vertex:0");
    expect(saved.measurements?.[0]?.second.id).toBe("vertex:1");
    expect(viewport).toHaveAttribute("data-measure-preview", "false");
  });

  it("shows saved distances and does not allow read-only changes", () => {
    const measured: Solid3DRecord = {
      ...record,
      measurements: [{
        id: "solid-distance:existing",
        first: { kind: "vertex", id: "vertex:0" },
        second: { kind: "vertex", id: "vertex:1" },
      }],
    };
    const onRecordChange = vi.fn();
    renderPanel({ initialRecord: measured, readOnly: true, onRecordChange });
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    expect(screen.getByText(/ед\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить измерение" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Удалить измерение solid-distance:existing" }),
    ).toBeDisabled();
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("expands the model without remounting the viewport", () => {
    renderPanel();
    const viewport = screen.getByTestId("mock-3d-viewport");
    fireEvent.click(screen.getByRole("button", { name: "Развернуть 3D-окно" }));
    expect(screen.getByTestId("solid-3d-editor").parentElement).toHaveClass(
      "is-expanded",
    );
    expect(screen.getByTestId("mock-3d-viewport")).toBe(viewport);
    fireEvent.click(screen.getByRole("button", { name: "Свернуть 3D-окно" }));
    expect(screen.getByTestId("solid-3d-editor").parentElement).not.toHaveClass(
      "is-expanded",
    );
  });

  it("moves and resizes within the workspace without remounting the viewport", async () => {
    renderPanel();
    const dock = screen.getByTestId("solid-3d-dock");
    const parent = dock.parentElement;
    expect(parent).not.toBeNull();
    vi.spyOn(parent!, "getBoundingClientRect").mockReturnValue({
      bottom: 700,
      height: 700,
      left: 0,
      right: 1500,
      top: 0,
      width: 1500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.resize(window);
    await waitFor(() => expect(dock).toHaveStyle({ left: "604px" }));
    const viewport = screen.getByTestId("mock-3d-viewport");
    const move = screen.getByRole("button", { name: "Переместить 3D-окно" });
    fireEvent.pointerDown(move, {
      button: 0,
      clientX: 500,
      clientY: 50,
      pointerId: 1,
    });
    fireEvent.pointerMove(move, {
      clientX: 400,
      clientY: 80,
      pointerId: 1,
    });
    fireEvent.pointerUp(move, { pointerId: 1 });
    expect(dock).toHaveStyle({ left: "504px", top: "46px" });

    const resize = screen.getByRole("button", {
      name: "Изменить размер 3D-окна",
    });
    fireEvent.pointerDown(resize, {
      button: 0,
      clientX: 800,
      clientY: 600,
      pointerId: 2,
    });
    fireEvent.pointerMove(resize, {
      clientX: 850,
      clientY: 520,
      pointerId: 2,
    });
    fireEvent.pointerUp(resize, { pointerId: 2 });
    expect(dock).toHaveStyle({ width: "930px", height: "540px" });

    fireEvent.keyDown(move, { key: "ArrowLeft" });
    expect(dock).toHaveStyle({ left: "494px" });
    fireEvent.keyDown(resize, { key: "ArrowUp", shiftKey: true });
    expect(dock).toHaveStyle({ height: "508px" });

    fireEvent.resize(window);
    expect(screen.getByTestId("mock-3d-viewport")).toBe(viewport);
  });

  it("closes on Escape without forwarding keyboard shortcuts", () => {
    const { onClose, onOutsideClick } = renderPanel();
    fireEvent.keyDown(screen.getByRole("button", { name: "Сбросить камеру" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("focuses the editor and restores its opener", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Открыть 3D";
    document.body.append(opener);
    opener.focus();

    try {
      const { unmount } = renderPanel();
      await waitFor(() =>
        expect(screen.getByTestId("solid-3d-editor")).toHaveFocus(),
      );
      unmount();
      await waitFor(() => expect(opener).toHaveFocus());
    } finally {
      opener.remove();
    }
  });

  it("keeps document editing controls disabled in read-only mode", () => {
    renderPanel({ readOnly: true });
    expect(
      screen.getByRole("button", { name: "Поставить точку" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Сечение" }));
    expect(
      screen.getByRole("button", { name: "Создать сечение" }),
    ).toBeDisabled();
  });
});
