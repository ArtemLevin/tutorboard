import { describe, expect, it } from "vitest";

import { readEnvironment } from "./environment";

describe("readEnvironment", () => {
  it.each(["development", "test", "production"] as const)(
    "accepts the %s stage",
    (stage) => {
      expect(readEnvironment(stage)).toEqual({
        boardApiBaseUrl: "/api/v1",
        features: {
          developmentDiagnostics: stage !== "production",
          documentSnapshots: true,
          geometryPrompt: true,
          serverSync: stage === "production",
        },
        geometryOsBaseUrl: `${window.location.origin}/api/v1/geometryos`,
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
      boardApiBaseUrl: "/api/v1",
      features: {
        developmentDiagnostics: true,
        documentSnapshots: true,
        geometryPrompt: true,
        serverSync: false,
      },
      geometryOsBaseUrl: "https://geometry.example.test",
      stage: "test",
    });
    expect(() =>
      readEnvironment("test", "https://user:secret@example.test"),
    ).toThrow("VITE_GEOMETRYOS_BASE_URL");
  });

  it("parses explicit feature flags and rejects ambiguous values", () => {
    expect(
      readEnvironment("production", undefined, {
        developmentDiagnostics: "1",
        documentSnapshots: "false",
        geometryPrompt: "0",
        serverSync: "true",
      }).features,
    ).toEqual({
      developmentDiagnostics: true,
      documentSnapshots: false,
      geometryPrompt: false,
      serverSync: true,
    });
    expect(() =>
      readEnvironment("test", undefined, { geometryPrompt: "perhaps" }),
    ).toThrow("VITE_FEATURE_GEOMETRY_PROMPT");
  });

  it("accepts only a same-origin board API path", () => {
    expect(
      readEnvironment("test", undefined, {}, "/platform/api/v1")
        .boardApiBaseUrl,
    ).toBe("/platform/api/v1");
    expect(() =>
      readEnvironment(
        "test",
        undefined,
        {},
        "https://boards.example.test/api/v1",
      ),
    ).toThrow("VITE_BOARD_API_BASE_URL");
  });
});
