import { describe, expect, it } from "vitest";

import { resolveSmartInkReleaseGate } from "./smart-ink-release";

describe("resolveSmartInkReleaseGate", () => {
  it.each([
    ["development", true],
    ["test", true],
    ["production", false],
  ] as const)("uses the %s stage default", (stage, expected) => {
    expect(resolveSmartInkReleaseGate(stage, undefined)).toBe(expected);
  });

  it("allows an explicit production promotion and rollback", () => {
    expect(resolveSmartInkReleaseGate("production", "true")).toBe(true);
    expect(resolveSmartInkReleaseGate("production", "false")).toBe(false);
  });

  it("rejects invalid release values", () => {
    expect(() => resolveSmartInkReleaseGate("production", "perhaps")).toThrow(
      "VITE_FEATURE_SMART_INK",
    );
    expect(() => resolveSmartInkReleaseGate("preview", undefined)).toThrow(
      "Unsupported VITE_APP_STAGE",
    );
  });
});
