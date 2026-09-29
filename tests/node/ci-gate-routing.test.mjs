import { describe, expect, it } from "vitest";

import {
  ciGateNames,
  classifyChangedFiles,
  computeGateRouting,
} from "../../scripts/ci/compute-gate-routing.mjs";

const allTrue = Object.fromEntries(ciGateNames.map((name) => [name, true]));
const allFalse = Object.fromEntries(ciGateNames.map((name) => [name, false]));

function routed(...paths) {
  return classifyChangedFiles(paths);
}

describe("CI gate routing", () => {
  it("keeps documentation-only changes on the fast PR gate", () => {
    expect(routed("README.md", "docs/architecture/ci.md")).toEqual(allFalse);
  });

  it("routes GeometryOS integration changes", () => {
    expect(routed("src/adapters/geometryos-http/client.ts").geometryos).toBe(
      true,
    );
  });

  it("routes coordinate plot implementation and shared persistence changes", () => {
    expect(routed("src/core/plot-sampling/sampler.ts").coordinate_plot).toBe(
      true,
    );
    expect(
      routed("src/adapters/persistence-dexie/repository.ts").coordinate_plot,
    ).toBe(true);
  });

  it("routes production container changes independently from coordinate plot", () => {
    expect(routed("Dockerfile")).toEqual({
      ...allFalse,
      production_image: true,
    });
  });

  it("routes nginx changes to both image and formula-recognition gates", () => {
    expect(routed("deploy/nginx.conf")).toEqual({
      ...allFalse,
      formula_recognition: true,
      production_image: true,
    });
  });

  it("routes Smart Ink ownership and composition changes", () => {
    expect(routed("src/modules/smart-ink/v2/recognizer.ts").smart_ink).toBe(
      true,
    );
    expect(routed("src/app/board-chrome/BoardToolDock.tsx").smart_ink).toBe(
      true,
    );
  });

  it("routes formula recognition adapter changes", () => {
    expect(
      routed("src/adapters/math-ink-http/client.ts").formula_recognition,
    ).toBe(true);
  });

  it("routes gateway changes to formula recognition and Paddle sidecar", () => {
    expect(routed("services/math-ink-proxy/server.mjs")).toEqual({
      ...allFalse,
      formula_recognition: true,
      paddle_formula: true,
    });
  });

  it("routes Paddle sidecar changes", () => {
    expect(
      routed("services/paddle-formula-sidecar/app.py").paddle_formula,
    ).toBe(true);
  });

  it("treats workflow and routing changes as global CI risk", () => {
    expect(routed(".github/workflows/ci.yml")).toEqual(allTrue);
    expect(routed("scripts/ci/compute-gate-routing.mjs")).toEqual(allTrue);
  });

  it("treats dependency and toolchain changes as global CI risk", () => {
    expect(routed("package-lock.json")).toEqual(allTrue);
    expect(routed(".nvmrc")).toEqual(allTrue);
  });

  it("routes deleted or renamed specialized paths from the name-only diff", () => {
    expect(
      routed(
        "src/modules/smart-ink/old.ts",
        "src/modules/renamed-smart-ink/new.ts",
      ).smart_ink,
    ).toBe(true);
  });

  it("runs every specialized gate on main and manual release events", () => {
    expect(computeGateRouting({ eventName: "push" })).toEqual(allTrue);
    expect(computeGateRouting({ eventName: "workflow_dispatch" })).toEqual(
      allTrue,
    );
  });

  it("fails closed for unsupported events", () => {
    expect(() =>
      computeGateRouting({ eventName: "schedule", changedFiles: [] }),
    ).toThrow(/Unsupported GitHub Actions event/u);
  });
});
