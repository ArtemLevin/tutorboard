import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const rendererLifecycle = vi.hoisted(() => ({
  created: 0,
  disposed: 0,
  renderCalls: 0,
  failNextCreation: false,
  contextsLost: 0,
  gizmoVisible: null as boolean | null,
  axisVisible: false,
}));

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  class FakeWebGLRenderer {
    readonly domElement = document.createElement("canvas");
    outputColorSpace = actual.SRGBColorSpace;

    constructor() {
      if (rendererLifecycle.failNextCreation) {
        rendererLifecycle.failNextCreation = false;
        throw new Error("Simulated WebGL allocation failure");
      }
      rendererLifecycle.created += 1;
    }

    dispose(): void {
      rendererLifecycle.disposed += 1;
    }

    forceContextLoss(): void {
      rendererLifecycle.contextsLost += 1;
    }

    render(scene: {
      getObjectByName(name: string): { visible: boolean } | undefined;
    }): void {
      rendererLifecycle.renderCalls += 1;
      rendererLifecycle.gizmoVisible =
        scene.getObjectByName("solid-rotation-gizmo")?.visible ?? null;
      rendererLifecycle.axisVisible =
        scene.getObjectByName("solid-rotation-two-point-axis") !== undefined;
    }

    setPixelRatio(): void {}

    setSize(): void {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

import {
  defaultSolidProjection,
  solid3DId,
  type Solid3DRecord,
} from "../../core/public";
import { Solid3DViewport } from "./Solid3DViewport";

function record(projection = defaultSolidProjection): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition: { edgeLength: 2, kind: "cube" },
    id: solid3DId("solid:viewport-lifecycle"),
    points: [],
    projection,
    rootGroupId: "group:viewport-lifecycle" as never,
    schemaVersion: "1.0",
    sections: [],
    source: { kind: "text-template", templateId: "cube" },
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect(): void {}
      observe(): void {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  rendererLifecycle.created = 0;
  rendererLifecycle.disposed = 0;
  rendererLifecycle.renderCalls = 0;
  rendererLifecycle.failNextCreation = false;
  rendererLifecycle.contextsLost = 0;
  rendererLifecycle.gizmoVisible = null;
  rendererLifecycle.axisVisible = false;
});

describe("Solid3DViewport WebGL lifecycle", () => {
  it("hides the rotation rings until opt-in without remounting WebGL", async () => {
    const base = record();
    const props = {
      cameraMode: "orthographic" as const,
      mode: "view" as const,
      onModelRotationCommit: vi.fn(),
      onPointPlace: vi.fn(),
      resetToken: 0,
      section: null,
      showSectionFill: false,
      showSectionOutline: false,
    };
    const view = render(<Solid3DViewport {...props} record={base} />);
    await waitFor(() => expect(rendererLifecycle.created).toBe(1));
    expect(rendererLifecycle.gizmoVisible).toBe(false);

    view.rerender(
      <Solid3DViewport {...props} record={base} showRotationGizmo />,
    );
    expect(rendererLifecycle.gizmoVisible).toBe(true);
    expect(rendererLifecycle.created).toBe(1);

    view.rerender(
      <Solid3DViewport {...props} record={base} showRotationGizmo={false} />,
    );
    expect(rendererLifecycle.gizmoVisible).toBe(false);
    expect(rendererLifecycle.created).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(0);
    view.unmount();
    expect(rendererLifecycle.disposed).toBe(1);
  });

  it("shows the dashed point axis only during the tool without WebGL remount", async () => {
    const props = {
      cameraMode: "orthographic" as const,
      mode: "view" as const,
      onPointPlace: vi.fn(),
      resetToken: 0,
      section: null,
      showSectionFill: false,
      showSectionOutline: false,
    };
    const base = record();
    const view = render(<Solid3DViewport {...props} record={base} />);
    await waitFor(() => expect(rendererLifecycle.created).toBe(1));
    expect(rendererLifecycle.axisVisible).toBe(false);

    view.rerender(
      <Solid3DViewport
        {...props}
        record={base}
        rotationAxis={[
          { x: -1, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
        ]}
      />,
    );
    expect(rendererLifecycle.axisVisible).toBe(true);
    expect(rendererLifecycle.created).toBe(1);

    view.rerender(
      <Solid3DViewport {...props} record={base} rotationAxis={null} />,
    );
    expect(rendererLifecycle.axisVisible).toBe(false);
    expect(rendererLifecycle.created).toBe(1);
    view.unmount();
    expect(rendererLifecycle.contextsLost).toBe(1);
  });

  it("reuses the renderer for identical definitions and camera projection changes", async () => {
    const initial = record();
    const props = {
      cameraMode: "orthographic" as const,
      mode: "view" as const,
      onPointPlace: vi.fn(),
      resetToken: 0,
      section: null,
      showSectionFill: false,
      showSectionOutline: false,
    };
    const view = render(<Solid3DViewport {...props} record={initial} />);
    await waitFor(() => expect(rendererLifecycle.created).toBe(1));
    const canvas = view.container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    view.rerender(
      <Solid3DViewport
        {...props}
        record={{ ...initial, definition: { ...initial.definition } }}
      />,
    );
    expect(rendererLifecycle.created).toBe(1);
    view.rerender(
      <Solid3DViewport
        {...props}
        cameraMode="perspective"
        record={{ ...initial, definition: { ...initial.definition } }}
      />,
    );
    expect(view.container.querySelector("canvas")).toBe(canvas);
    expect(rendererLifecycle.created).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(0);
    view.unmount();
    expect(rendererLifecycle.disposed).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(1);
  });

  it("keeps the original canvas during WebGL loss, resumes after restoration", async () => {
    const base = record();
    const props = {
      cameraMode: "orthographic" as const,
      mode: "view" as const,
      onPointPlace: vi.fn(),
      resetToken: 0,
      section: null,
      showSectionFill: false,
      showSectionOutline: false,
    };
    const view = render(<Solid3DViewport {...props} record={base} />);
    await waitFor(() => expect(rendererLifecycle.created).toBe(1));
    const canvas = view.container.querySelector("canvas")!;
    const beforeLoss = rendererLifecycle.renderCalls;
    const lost = new Event("webglcontextlost", { cancelable: true });
    act(() => canvas.dispatchEvent(lost));
    expect(lost.defaultPrevented).toBe(true);
    expect(screen.getByText("Контекст WebGL был потерян.")).toBeVisible();
    expect(view.container.querySelector("canvas")).toBe(canvas);
    view.rerender(
      <Solid3DViewport
        {...props}
        record={{
          ...base,
          projection: { ...base.projection, viewportScale: 1.3 },
        }}
      />,
    );
    expect(rendererLifecycle.renderCalls).toBe(beforeLoss);
    expect(rendererLifecycle.created).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(0);
    act(() => canvas.dispatchEvent(new Event("webglcontextrestored")));
    expect(screen.queryByText("Контекст WebGL был потерян.")).toBeNull();
    expect(view.container.querySelector("canvas")).toBe(canvas);
    expect(rendererLifecycle.renderCalls).toBeGreaterThan(beforeLoss);
    view.unmount();
    expect(rendererLifecycle.disposed).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(1);
  });

  it("retries a lost context with one cleanup and one fresh renderer", async () => {
    const props = {
      cameraMode: "perspective" as const,
      mode: "view" as const,
      onPointPlace: vi.fn(),
      resetToken: 0,
      section: null,
      showSectionFill: false,
      showSectionOutline: false,
    };
    const view = render(<Solid3DViewport {...props} record={record()} />);
    const firstCanvas = view.container.querySelector("canvas")!;
    act(() =>
      firstCanvas.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      ),
    );
    act(() =>
      screen.getByRole("button", { name: "Повторить запуск 3D" }).click(),
    );
    expect(rendererLifecycle.created).toBe(2);
    expect(rendererLifecycle.disposed).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(1);
    expect(view.container.querySelector("canvas")).not.toBe(firstCanvas);
    expect(firstCanvas.isConnected).toBe(false);
    act(() => firstCanvas.dispatchEvent(new Event("webglcontextrestored")));
    expect(rendererLifecycle.created).toBe(2);
    view.unmount();
    expect(rendererLifecycle.disposed).toBe(2);
    expect(rendererLifecycle.contextsLost).toBe(2);
  });

  it("keeps a visible retry path if initial WebGL allocation fails", async () => {
    rendererLifecycle.failNextCreation = true;
    const view = render(
      <Solid3DViewport
        cameraMode="orthographic"
        mode="view"
        onPointPlace={vi.fn()}
        record={record()}
        resetToken={0}
        section={null}
        showSectionFill={false}
        showSectionOutline={false}
      />,
    );
    await screen.findByText("WebGL не удалось запустить.");
    expect(rendererLifecycle.created).toBe(0);
    act(() =>
      screen.getByRole("button", { name: "Повторить запуск 3D" }).click(),
    );
    await waitFor(() => expect(rendererLifecycle.created).toBe(1));
    expect(screen.queryByText("WebGL не удалось запустить.")).toBeNull();
    view.unmount();
    expect(rendererLifecycle.disposed).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(1);
  });

  it("disposes GPU objects, controls and context across repeated openings", () => {
    const geometryDisposed = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "dispose",
    );
    const materialDisposed = vi.spyOn(THREE.Material.prototype, "dispose");
    const props = {
      cameraMode: "orthographic" as const,
      mode: "view" as const,
      onPointPlace: vi.fn(),
      resetToken: 0,
      section: null,
      showSectionFill: false,
      showSectionOutline: false,
    };
    try {
      for (let index = 0; index < 3; index += 1) {
        const view = render(<Solid3DViewport {...props} record={record()} />);
        expect(view.container.querySelectorAll("canvas")).toHaveLength(1);
        view.unmount();
      }
      expect(rendererLifecycle.created).toBe(3);
      expect(rendererLifecycle.disposed).toBe(3);
      expect(rendererLifecycle.contextsLost).toBe(3);
      expect(geometryDisposed).toHaveBeenCalled();
      expect(materialDisposed).toHaveBeenCalled();
    } finally {
      geometryDisposed.mockRestore();
      materialDisposed.mockRestore();
    }
  });

  it("updates a persisted rotation without recreating the renderer", async () => {
    const props = {
      cameraMode: "perspective" as const,
      mode: "view" as const,
      onPointPlace: vi.fn(),
      resetToken: 0,
      section: null,
      showSectionFill: false,
      showSectionOutline: false,
    };
    const baseRecord = record();
    const view = render(<Solid3DViewport {...props} record={baseRecord} />);
    await waitFor(() => expect(rendererLifecycle.created).toBe(1));

    view.rerender(
      <Solid3DViewport
        {...props}
        record={{
          ...baseRecord,
          projection: {
            ...defaultSolidProjection,
            matrix: [1, 0, 0, 0, 1, 0, 0, 0.2, 0, 0.98],
          },
        }}
      />,
    );

    expect(rendererLifecycle.created).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(0);
    view.unmount();
    expect(rendererLifecycle.disposed).toBe(1);
    expect(rendererLifecycle.contextsLost).toBe(1);
  });
});
