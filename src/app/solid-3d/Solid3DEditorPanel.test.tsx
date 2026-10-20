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
  Solid3DViewport: () => <div data-testid="mock-3d-viewport" />,
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

  it("closes on Escape within the editor without forwarding shortcuts to the board", () => {
    const { onClose, onOutsideClick } = renderPanel();
    fireEvent.keyDown(screen.getByRole("button", { name: "Сбросить камеру" }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("focuses the embedded editor and restores its opener after unmount", async () => {
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
    expect(screen.getByRole("button", { name: "Поставить точку" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Создать сечение" })).toBeDisabled();
  });
});
