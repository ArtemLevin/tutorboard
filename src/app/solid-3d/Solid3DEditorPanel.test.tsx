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
    onAngleEdgePick?: (edgeId: string) => void;
    onFacePick?: (faceId: string) => void;
    dihedralSelectedFaces?: readonly string[];
    dihedralPreview?: readonly [string, string] | null;
    linePlanePreview?: { readonly faceId: string } | null;
    linePlaneSelectedLine?: readonly unknown[] | null;
    anglePreview?: readonly unknown[] | null;
    measurementPreview?: readonly unknown[] | null;
  }) => (
    <div
      data-testid="mock-3d-viewport"
      data-rotation-gizmo={String(props.showRotationGizmo ?? false)}
      data-viewport-mode={props.mode}
      data-measure-preview={String(props.measurementPreview != null)}
      data-angle-preview={String(props.anglePreview != null)}
      data-line-plane-preview={String(props.linePlanePreview != null)}
      data-dihedral-preview={String(props.dihedralPreview != null)}
      data-dihedral-count={String(props.dihedralSelectedFaces?.length ?? 0)}
      data-line-plane-selected={String(props.linePlaneSelectedLine != null)}
      data-face-picker={String(props.onFacePick !== undefined)}
      data-edge-picker={String(props.onAngleEdgePick !== undefined)}
      data-vertex-picker={String(props.onMeasurementPick !== undefined)}
    >
      <button type="button" onClick={() => props.onFacePick?.("face:0")}>
        Выбрать противоположную грань
      </button>
      <button type="button" onClick={() => props.onFacePick?.("face:2")}>
        Выбрать соседнюю грань
      </button>
      <button type="button" onClick={() => props.onFacePick?.("face:1")}>
        Выбрать грань
      </button>
      <button type="button" onClick={() => props.onAngleEdgePick?.("edge:0:1")}>
        Выбрать первое ребро
      </button>
      <button type="button" onClick={() => props.onAngleEdgePick?.("edge:0:3")}>
        Выбрать второе ребро
      </button>
      <button
        onClick={() =>
          props.onMeasurementPick?.({ kind: "vertex", id: "vertex:0" })
        }
        type="button"
      >
        Выбрать начало на модели
      </button>
      <button
        onClick={() =>
          props.onMeasurementPick?.({ kind: "vertex", id: "vertex:1" })
        }
        type="button"
      >
        Выбрать конец на модели
      </button>
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
      "aria-pressed",
      "true",
    );
    expect(viewport).toHaveAttribute("data-measure-preview", "false");
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать начало на модели" }),
    );
    expect(screen.getByText("Выберите вторую точку")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать конец на модели" }),
    );
    expect(viewport).toHaveAttribute("data-measure-preview", "true");
    expect(screen.getByText(/Длина:/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить измерение" }),
    );
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
      measurements: [
        {
          id: "solid-distance:existing",
          first: { kind: "vertex", id: "vertex:0" },
          second: { kind: "vertex", id: "vertex:1" },
        },
      ],
    };
    const onRecordChange = vi.fn();
    renderPanel({ initialRecord: measured, readOnly: true, onRecordChange });
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    expect(screen.getByText(/ед\./)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Сохранить измерение" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Удалить измерение solid-distance:existing",
      }),
    ).toBeDisabled();
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("selects two semantic edges to preview and save a 3D line angle", () => {
    const onRecordChange = vi.fn();
    renderPanel({ onRecordChange });
    const viewport = screen.getByTestId("mock-3d-viewport");
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(screen.getByRole("button", { name: "Угол между прямыми" }));
    expect(screen.getByRole("button", { name: "По рёбрам" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(viewport).toHaveAttribute("data-angle-preview", "false");
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать первое ребро" }),
    );
    expect(screen.getByText("Выбрано прямых: 1 из 2")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать второе ребро" }),
    );
    expect(viewport).toHaveAttribute("data-angle-preview", "true");
    expect(screen.getByText(/Меньший угол:/)).toHaveTextContent("90.00°");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить угол" }));
    expect(onRecordChange).toHaveBeenCalledOnce();
    const saved = onRecordChange.mock.calls[0]![0] as Solid3DRecord;
    expect(saved.angleMeasurements).toHaveLength(1);
    expect(
      saved.angleMeasurements![0]!.lines[0].map(({ id }) => id).sort(),
    ).toEqual(["vertex:0", "vertex:1"]);
    expect(viewport).toHaveAttribute("data-angle-preview", "false");
  });

  it("switches to point-pair selection and protects saved angles in read-only mode", () => {
    const initialRecord: Solid3DRecord = {
      ...record,
      angleMeasurements: [
        {
          id: "solid-angle:read-only",
          lines: [
            [
              { kind: "vertex", id: "vertex:0" },
              { kind: "vertex", id: "vertex:1" },
            ],
            [
              { kind: "vertex", id: "vertex:0" },
              { kind: "vertex", id: "vertex:3" },
            ],
          ],
        },
      ],
    };
    const onRecordChange = vi.fn();
    renderPanel({ initialRecord, readOnly: true, onRecordChange });
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(screen.getByRole("button", { name: "Угол между прямыми" }));
    expect(screen.getByText(/90.00°/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "По четырём точкам" }));
    expect(
      screen.getByRole("button", { name: "По четырём точкам" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Сохранить угол" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Удалить угол solid-angle:read-only",
      }),
    ).toBeDisabled();
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("isolates edge and face selection from other work modes and tools", () => {
    const onRecordChange = vi.fn();
    renderPanel({ onRecordChange });
    const viewport = screen.getByTestId("mock-3d-viewport");
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(screen.getByRole("button", { name: "Угол прямой с плоскостью" }));
    expect(viewport).toHaveAttribute("data-edge-picker", "true");
    expect(viewport).toHaveAttribute("data-face-picker", "false");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать первое ребро" }));
    expect(viewport).toHaveAttribute("data-face-picker", "true");

    // Switching work mode must release BOTH stale semantic interceptors.
    fireEvent.click(screen.getByRole("button", { name: "Поставить точку" }));
    expect(viewport).toHaveAttribute("data-viewport-mode", "points");
    expect(viewport).toHaveAttribute("data-edge-picker", "false");
    expect(viewport).toHaveAttribute("data-face-picker", "false");
    expect(viewport).toHaveAttribute("data-vertex-picker", "false");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать грань" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать первое ребро" }));
    expect(onRecordChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Сечение" }));
    expect(viewport).toHaveAttribute("data-edge-picker", "false");
    expect(viewport).toHaveAttribute("data-face-picker", "false");
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(screen.getByRole("button", { name: "Двугранный угол" }));
    expect(viewport).toHaveAttribute("data-face-picker", "true");
    expect(viewport).toHaveAttribute("data-edge-picker", "false");
    expect(viewport).toHaveAttribute("data-vertex-picker", "false");
    fireEvent.click(screen.getByRole("button", { name: "Исследование" }));
    expect(viewport).toHaveAttribute("data-face-picker", "false");
  });

  it("activates point picks exclusively for distance, line angle and line-plane tools", () => {
    renderPanel();
    const viewport = screen.getByTestId("mock-3d-viewport");
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(screen.getByRole("button", { name: "Угол прямой с плоскостью" }));
    fireEvent.click(screen.getByRole("button", { name: "По двум точкам" }));
    expect(viewport).toHaveAttribute("data-vertex-picker", "true");
    expect(viewport).toHaveAttribute("data-edge-picker", "false");
    fireEvent.click(screen.getByRole("button", { name: "Двугранный угол" }));
    expect(viewport).toHaveAttribute("data-vertex-picker", "false");
    expect(viewport).toHaveAttribute("data-face-picker", "true");
    fireEvent.click(screen.getByRole("button", { name: "Угол между прямыми" }));
    expect(viewport).toHaveAttribute("data-edge-picker", "true");
    expect(viewport).toHaveAttribute("data-face-picker", "false");
    expect(viewport).toHaveAttribute("data-vertex-picker", "false");
    fireEvent.click(screen.getByRole("button", { name: "По четырём точкам" }));
    expect(viewport).toHaveAttribute("data-edge-picker", "false");
    expect(viewport).toHaveAttribute("data-vertex-picker", "true");
    fireEvent.click(screen.getByRole("button", { name: "Расстояние" }));
    expect(viewport).toHaveAttribute("data-vertex-picker", "true");
    expect(viewport).toHaveAttribute("data-face-picker", "false");
  });

  it("selects a line and its face, previews and saves line-plane angle", () => {
    const onRecordChange = vi.fn();
    renderPanel({ onRecordChange });
    const viewport = screen.getByTestId("mock-3d-viewport");
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Угол прямой с плоскостью" }),
    );
    expect(screen.getByRole("button", { name: "По ребру" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(viewport).toHaveAttribute("data-line-plane-preview", "false");
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать первое ребро" }),
    );
    expect(screen.getByText("Шаг 2 из 2: плоскость")).toBeInTheDocument();
    expect(viewport).toHaveAttribute("data-line-plane-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать грань" }));
    expect(viewport).toHaveAttribute("data-line-plane-preview", "true");
    expect(screen.getByText(/Меньший угол:/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить угол прямой и плоскости" }),
    );
    expect(onRecordChange).toHaveBeenCalledOnce();
    const updated = onRecordChange.mock.calls[0]![0] as Solid3DRecord;
    expect(updated.linePlaneMeasurements).toHaveLength(1);
    expect(updated.linePlaneMeasurements![0]!.faceId).toBe("face:1");
    expect(
      updated.linePlaneMeasurements![0]!.line.map(({ id }) => id).sort(),
    ).toEqual(["vertex:0", "vertex:1"]);
    expect(viewport).toHaveAttribute("data-line-plane-preview", "false");
  });

  it("protects saved line-plane angles in read-only mode", () => {
    const initialRecord: Solid3DRecord = {
      ...record,
      linePlaneMeasurements: [
        {
          id: "solid-line-plane:read-only",
          line: [
            { kind: "vertex", id: "vertex:0" },
            { kind: "vertex", id: "vertex:1" },
          ],
          faceId: "face:1",
        },
      ],
    };
    const onRecordChange = vi.fn();
    renderPanel({ initialRecord, readOnly: true, onRecordChange });
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Угол прямой с плоскостью" }),
    );
    expect(
      screen.getByRole("button", { name: "Сохранить угол прямой и плоскости" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Удалить угол прямой и плоскости solid-line-plane:read-only",
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "По двум точкам" }));
    expect(
      screen.getByRole("button", { name: "По двум точкам" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("selects two neighboring faces, previews and saves their dihedral", () => {
    const onRecordChange = vi.fn();
    renderPanel({ onRecordChange });
    const viewport = screen.getByTestId("mock-3d-viewport");
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(screen.getByRole("button", { name: "Двугранный угол" }));
    expect(viewport).toHaveAttribute("data-dihedral-preview", "false");
    fireEvent.click(screen.getByRole("button", { name: "Выбрать грань" }));
    expect(viewport).toHaveAttribute("data-dihedral-count", "1");
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать соседнюю грань" }),
    );
    expect(viewport).toHaveAttribute("data-dihedral-preview", "true");
    expect(screen.getByText("Линейный угол: 90.00°")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Сохранить двугранный угол" }),
    );
    expect(onRecordChange).toHaveBeenCalledOnce();
    const next = onRecordChange.mock.calls[0]![0] as Solid3DRecord;
    expect(next.dihedralMeasurements).toHaveLength(1);
    expect(next.dihedralMeasurements![0]!.faces).toEqual(["face:1", "face:2"]);
    expect(viewport).toHaveAttribute("data-dihedral-count", "0");
  });

  it("rejects nonadjacent faces and protects saved dihedrals in read-only mode", () => {
    const onRecordChange = vi.fn();
    renderPanel({ onRecordChange });
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(screen.getByRole("button", { name: "Двугранный угол" }));
    fireEvent.click(screen.getByRole("button", { name: "Выбрать грань" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Выбрать противоположную грань" }),
    );
    expect(screen.getByText(/единственное общее ребро/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Сохранить двугранный угол" }),
    ).toBeDisabled();
    expect(onRecordChange).not.toHaveBeenCalled();
  });

  it("renders saved dihedrals with disabled deletion for a read-only guest", () => {
    const onRecordChange = vi.fn();
    const initialRecord: Solid3DRecord = {
      ...record,
      dihedralMeasurements: [
        {
          id: "solid-dihedral:existing",
          faces: ["face:1", "face:2"],
        },
      ],
    };
    renderPanel({ initialRecord, readOnly: true, onRecordChange });
    fireEvent.click(screen.getByRole("button", { name: "Измерить" }));
    fireEvent.click(screen.getByRole("button", { name: "Двугранный угол" }));
    expect(
      screen.getByRole("button", { name: "Сохранить двугранный угол" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Удалить двугранный угол solid-dihedral:existing",
      }),
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
