import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererLifecycle = vi.hoisted(() => ({
  created: 0,
  disposed: 0,
  contextsLost: 0,
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

    render(): void {}

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
});

describe("Solid3DViewport WebGL lifecycle", () => {
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
