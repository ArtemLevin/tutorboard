export const mathInkHttpAdapterContractVersion = "2.0" as const;

export {
  createMathInkHttpRecognizer,
  MathInkHttpError,
  mathInkRequestIdHeader,
  type MathInkHttpRecognizerOptions,
} from "./client";
export {
  calculateMathInkRasterLayout,
  rasterizeMathInkRequest,
  type MathInkRasterizer,
  type MathInkRasterLayout,
  type RasterizedMathInkImage,
} from "./rasterization";
export {
  formulaRecognitionResultSchemaVersion,
  mathInkProxyResultSchemaVersion,
} from "./validation";
