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
  Solid3DViewport: (props: { showRotationGizmo?: boolean }) => (
    <div
      data-testid="mock-3d-viewport"
      data-rotation-gizmo={String(props.showRotationGizmo ?? false)}
    />
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
}: {
  readonly onClose?: () => void;
  readonly readOnly?: boolean;
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
        onRecordChange={vi.fn()}
        onPointMove={vi.fn()}
        onSaveSweep={vi.fn()}
        onUndo={vi.fn()}
        readOnly={readOnly}
        record={record}
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

    fireEvent.click(screen.getByRole("button", { name: "Вращение камеры" }));
    expect(viewport).toHaveAttribute("data-rotation-gizmo", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Скрыть кольца поворота" }),
    );
    expect(viewport).toHaveAttribute("data-rotation-gizmo", "false");
    expect(screen.getByTestId("mock-3d-viewport")).toBe(viewport);
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
      right: 900,
      top: 0,
      width: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.resize(window);
    await waitFor(() => expect(dock).toHaveStyle({ left: "274px" }));
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
    expect(dock).toHaveStyle({ left: "174px", top: "46px" });

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
    expect(dock).toHaveStyle({ width: "660px", height: "540px" });

    fireEvent.keyDown(move, { key: "ArrowLeft" });
    expect(dock).toHaveStyle({ left: "164px" });
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
    expect(
      screen.getByRole("button", { name: "Создать сечение" }),
    ).toBeDisabled();
  });
});
