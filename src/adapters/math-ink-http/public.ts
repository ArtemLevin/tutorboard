export const mathInkHttpAdapterContractVersion = "1.0" as const;

export {
  createMathInkHttpRecognizer,
  MathInkHttpError,
  mathInkRequestIdHeader,
  type MathInkHttpRecognizerOptions,
} from "./client";
export { mathInkProxyResultSchemaVersion } from "./validation";
