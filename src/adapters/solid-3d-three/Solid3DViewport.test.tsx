import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererLifecycle = vi.hoisted(() => ({
  created: 0,
  disposed: 0,
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
        rotationAxis={[{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]}
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
