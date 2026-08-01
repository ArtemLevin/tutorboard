from pathlib import Path
p=Path('scripts/apply-coordinate-plot-review-fixes.mjs')
s=p.read_text()

def rep(old,new,count=1):
    global s
    n=s.count(old)
    if n!=count:
        raise SystemExit(f'expected {count} occurrences, found {n}: {old[:100]!r}')
    s=s.replace(old,new,count)

# Insert identifier-based dependency helper before compileExplicit transformation.
anchor='''replaceOnce(\n  preparationPath,\n  `  | {\\n      readonly domain: { readonly max: number; readonly min: number } | null;\\n      readonly expression: CompiledPlotExpression;\\n      readonly ok: true;\\n`,\n'''
insert='''replaceOnce(\n  preparationPath,\n  `export function compileExplicit(input: {\\n`,\n  `function referencedParameterNames(\\n  sources: readonly string[],\\n  parameterNames: readonly string[],\\n): readonly string[] {\\n  const allowed = new Set(parameterNames);\\n  const referenced = new Set<string>();\\n  for (const source of sources) {\\n    for (const identifier of source.match(/[A-Za-z_][A-Za-z0-9_]*/gu) ?? []) {\\n      if (allowed.has(identifier)) referenced.add(identifier);\\n    }\\n  }\\n  return [...referenced].sort();\\n}\\n\\nexport function compileExplicit(input: {\\n`,\n);\n'''+anchor
rep(anchor,insert)

# Remove opaque bindingNames reads introduced after compile.
block='''replaceOnce(\n  preparationPath,\n  `  if (!expression.ok) return expression;\\n\\n  const domainValues: { max?: number; min?: number } = {};\\n`,\n  `  if (!expression.ok) return expression;\\n\\n  const bindingNames = new Set(expression.expression.bindingNames);\\n  bindingNames.delete("x");\\n  const domainValues: { max?: number; min?: number } = {};\\n`,\n);\n'''
rep(block,'')
block='''replaceOnce(\n  preparationPath,\n  `    if (!compiled.ok) {\\n      diagnostics.push(...compiled.diagnostics);\\n      continue;\\n    }\\n    const evaluated = evaluateScalar(\\n`,\n  `    if (!compiled.ok) {\\n      diagnostics.push(...compiled.diagnostics);\\n      continue;\\n    }\\n    compiled.expression.bindingNames.forEach((name) => bindingNames.add(name));\\n    const evaluated = evaluateScalar(\\n`,\n);\n'''
rep(block,'')

rep(
'''  `  return {\\n    domain: minimum < maximum ? { max: maximum, min: minimum } : null,\\n    expression: expression.expression,\\n    ok: true,\\n  };\\n`,\n  `  return {\\n    bindingNames: [...bindingNames].sort(),\\n    domain: minimum < maximum ? { max: maximum, min: minimum } : null,\\n    expression: expression.expression,\\n    ok: true,\\n  };\\n`,\n''',
'''  `  return {\\n    domain: minimum < maximum ? { max: maximum, min: minimum } : null,\\n    expression: expression.expression,\\n    ok: true,\\n  };\\n`,\n  `  return {\\n    bindingNames: referencedParameterNames(\\n      [\\n        input.series.expression,\\n        input.series.domain.minExpression ?? "",\\n        input.series.domain.maxExpression ?? "",\\n      ],\\n      input.parameterNames,\\n    ),\\n    domain: minimum < maximum ? { max: maximum, min: minimum } : null,\\n    expression: expression.expression,\\n    ok: true,\\n  };\\n`,\n''')

rep(
'''  `  return {\\n    ok: true,\\n    range: { max: maximumValue.value, min: minimumValue.value },\\n`,\n  `  const bindingNames = new Set(\\n    [\\n      ...xExpression.expression.bindingNames,\\n      ...yExpression.expression.bindingNames,\\n      ...minimum.expression.bindingNames,\\n      ...maximum.expression.bindingNames,\\n    ].filter((name) => name !== "t"),\\n  );\\n  return {\\n    bindingNames: [...bindingNames].sort(),\\n    ok: true,\\n    range: { max: maximumValue.value, min: minimumValue.value },\\n`,\n''',
'''  `  return {\\n    ok: true,\\n    range: { max: maximumValue.value, min: minimumValue.value },\\n`,\n  `  return {\\n    bindingNames: referencedParameterNames(\\n      [\\n        input.series.xExpression,\\n        input.series.yExpression,\\n        input.series.range.minExpression,\\n        input.series.range.maxExpression,\\n      ],\\n      input.parameterNames,\\n    ),\\n    ok: true,\\n    range: { max: maximumValue.value, min: minimumValue.value },\\n`,\n''')

# Add diagnostic type to generated sampler.
rep(
'''  CoordinatePlotSeriesSamplingResult,\\n  PlotSamplingStopReason,\\n  SampledPlotSeries,\\n''',
'''  CoordinatePlotSeriesSamplingResult,\\n  PlotSamplingDiagnostic,\\n  PlotSamplingStopReason,\\n  SampledPlotSeries,\\n''')
rep('''    const diagnostics = [];\\n''','''    const diagnostics: PlotSamplingDiagnostic[] = [];\\n''')

# Remove obsolete nullableNumber from generated panel.
old='''  `function nullableNumber(value: string): number | null {\\n  if (value.trim() === "") return null;\\n  const parsed = Number(value);\\n  return Number.isFinite(parsed) ? parsed : null;\\n}\\n\\nfunction NumberDraftInput({\\n'''
new='''  `function NumberDraftInput({\\n'''
rep(old,new)

# Fit may use finite data bounds from fully clipped geometry.
rep(
'''(status !== "sampled" && status !== "truncated")\\n''',
'''(status !== "sampled" && status !== "truncated" && status !== "empty")\\n''',
)

p.write_text(s)
