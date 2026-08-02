import { createMathInkHttpRecognizer } from "../../adapters/math-ink-http/public";
import type { MathInkRecognizer } from "../../modules/handwritten-function/public";
import type { AppEnvironment } from "../configuration/environment";

export function createConfiguredMathInkRecognizer(
  environment: AppEnvironment,
): MathInkRecognizer | undefined {
  if (
    !environment.features.handwrittenFunctions ||
    !environment.features.mathInkRecognition
  ) {
    return undefined;
  }
  return createMathInkHttpRecognizer({
    baseUrl: environment.mathInkApiBaseUrl,
  });
}
