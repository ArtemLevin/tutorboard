export interface NormalizedPlotExpression {
  readonly indexMap: readonly number[];
  readonly source: string;
}

const replacements: Readonly<Record<string, string>> = {
  π: "pi",
  "×": "*",
  "·": "*",
  "⋅": "*",
  "÷": "/",
  "−": "-",
  "–": "-",
  "—": "-",
  "²": "^2",
  "³": "^3",
};

export function normalizePlotExpression(
  originalSource: string,
): NormalizedPlotExpression {
  let source = "";
  const indexMap: number[] = [];

  for (let index = 0; index < originalSource.length; index += 1) {
    const character = originalSource[index]!;
    const replacement = replacements[character] ?? character;
    source += replacement;
    for (let offset = 0; offset < replacement.length; offset += 1) {
      indexMap.push(index);
    }
  }

  indexMap.push(originalSource.length);
  return { indexMap, source };
}

export function originalExpressionSpan(
  normalized: NormalizedPlotExpression,
  start: number,
  end: number,
): { readonly end: number; readonly start: number } {
  const safeStart = Math.max(0, Math.min(start, normalized.source.length));
  const safeEnd = Math.max(safeStart, Math.min(end, normalized.source.length));
  const originalStart = normalized.indexMap[safeStart] ?? 0;
  const mappedEnd = normalized.indexMap[safeEnd] ?? originalStart;
  const originalEnd =
    safeEnd > safeStart && mappedEnd === originalStart
      ? originalStart + 1
      : mappedEnd;
  return { end: originalEnd, start: originalStart };
}
