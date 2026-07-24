import { describe, expect, it } from "vitest";

import { readEnvironment } from "./environment";

describe("readEnvironment", () => {
  it.each(["development", "test", "production"] as const)(
    "accepts the %s stage",
    (stage) => {
      expect(readEnvironment(stage)).toEqual({ stage });
    },
  );

  it("fails fast for an unknown stage", () => {
    expect(() => readEnvironment("preview")).toThrow(
      "Unsupported VITE_APP_STAGE: preview",
    );
  });
});
