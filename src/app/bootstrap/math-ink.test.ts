import type { AppEnvironment } from "../configuration/environment";
import { createConfiguredMathInkRecognizer } from "./math-ink";

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
      ...features,
    },
    geometryOsBaseUrl: "https://geometry.example.test",
    mathInkApiBaseUrl: "/api/v1/math-ink",
    stage: "test",
  };
}

describe("math ink bootstrap composition", () => {
  it("keeps automatic recognition opt-in", () => {
    expect(createConfiguredMathInkRecognizer(environment())).toBeUndefined();
    expect(
      createConfiguredMathInkRecognizer(
        environment({ handwrittenFunctions: false, mathInkRecognition: true }),
      ),
    ).toBeUndefined();
  });

  it("creates the same-origin HTTP recognizer when both flags are enabled", () => {
    const recognizer = createConfiguredMathInkRecognizer(
      environment({ mathInkRecognition: true }),
    );
    expect(recognizer).toMatchObject({
      id: "mathpix.strokes.via-tutorboard-proxy",
      version: "1.0",
    });
  });
});
