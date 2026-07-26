import { describe, expect, it } from "vitest";

import { readEnvironment } from "./environment";

describe("readEnvironment", () => {
  it.each(["development", "test", "production"] as const)(
    "accepts the %s stage",
    (stage) => {
      expect(readEnvironment(stage)).toEqual({
        geometryOsBaseUrl: "http://localhost:8000",
        stage,
      });
    },
  );

  it("fails fast for an unknown stage", () => {
    expect(() => readEnvironment("preview")).toThrow(
      "Unsupported VITE_APP_STAGE: preview",
    );
  });

  it("accepts only public HTTP(S) GeometryOS URLs", () => {
    expect(readEnvironment("test", "https://geometry.example.test")).toEqual({
      geometryOsBaseUrl: "https://geometry.example.test",
      stage: "test",
    });
    expect(() =>
      readEnvironment("test", "https://user:secret@example.test"),
    ).toThrow("VITE_GEOMETRYOS_BASE_URL");
  });
});
