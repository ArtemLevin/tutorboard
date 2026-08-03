import { createMathInkHttpRecognizer } from "../../adapters/math-ink-http/public";
import {
  mathInkRecognitionProviders,
  type MathInkRecognitionProvider,
  type MathInkRecognizer,
} from "../../modules/handwritten-function/public";
import type { AppEnvironment } from "../configuration/environment";

export type MathInkRecognizerRegistry = Readonly<
  Partial<Record<MathInkRecognitionProvider, MathInkRecognizer>>
>;

export function createConfiguredMathInkRecognizers(
  environment: AppEnvironment,
): MathInkRecognizerRegistry {
  if (
    !environment.features.handwrittenFunctions ||
    !environment.features.mathInkRecognition
  ) {
    return {};
  }
  return Object.fromEntries(
    mathInkRecognitionProviders.map((provider) => [
      provider,
      createMathInkHttpRecognizer({
        baseUrl: environment.mathInkApiBaseUrl,
        provider,
      }),
    ]),
  ) as MathInkRecognizerRegistry;
}
