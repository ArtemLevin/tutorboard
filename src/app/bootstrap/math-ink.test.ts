import { describe, expect, it } from "vitest";

import type { AppEnvironment } from "../configuration/environment";
import { createConfiguredMathInkRecognizers } from "./math-ink";

function environment(
  features: Partial<AppEnvironment["features"]> = {},
): AppEnvironment {
  return {
    boardApiBaseUrl: "/api/v1",
    features: {
      developmentDiagnostics: true,
      documentSnapshots: true,
      geometryPrompt: true,
      handwrittenFunctions: true,
      mathInkRecognition: false,
      serverSync: false,
      smartInk: true,
      smartInkDiagnostics: true,
      solid3D: true,
      solid3DLearning: true,
      ...features,
    },
    geometryOsBaseUrl: "https://geometry.example.test",
    mathInkApiBaseUrl: "/api/v1/formula-recognition",
    profile: "full",
    stage: "test",
  };
}

describe("formula recognition bootstrap composition", () => {
  it("keeps automatic recognition opt-in", () => {
    expect(createConfiguredMathInkRecognizers(environment())).toEqual({});
    expect(
      createConfiguredMathInkRecognizers(
        environment({ handwrittenFunctions: false, mathInkRecognition: true }),
      ),
    ).toEqual({});
  });

  it("creates one same-origin recognizer for every supported provider", () => {
    const recognizers = createConfiguredMathInkRecognizers(
      environment({ mathInkRecognition: true }),
    );
    expect(recognizers.paddleocr).toMatchObject({
      id: "paddleocr.via-tutorboard-gateway",
      version: "2.0",
    });
    expect(recognizers["local-ocr-llm"]).toMatchObject({
      id: "local-ocr-llm.via-tutorboard-gateway",
      version: "2.0",
    });
    expect(recognizers["yandex-ai-studio"]).toMatchObject({
      id: "yandex-ai-studio.via-tutorboard-gateway",
      version: "2.0",
    });
  });
});
