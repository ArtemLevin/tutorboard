export const svgImportLimits = {
  maxAspectRatio: 1_000,
  maxAttributesPerElement: 64,
  maxDepth: 32,
  maxDimension: 16_384,
  maxInputBytes: 512 * 1024,
  maxNodes: 5_000,
  maxPathDataCharacters: 128_000,
  maxSanitizedBytes: 512 * 1024,
  maxTotalAttributes: 20_000,
  maxViewBoxSpan: 1_000_000,
} as const;
