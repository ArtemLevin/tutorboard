import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(path, content);
}

function replaceOnce(path, search, replacement) {
  const source = read(path);
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing anchor in ${path}: ${search.slice(0, 120)}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Ambiguous anchor in ${path}: ${search.slice(0, 120)}`);
  }
  write(path, source.slice(0, first) + replacement + source.slice(first + search.length));
}

function replaceRegexOnce(path, pattern, replacement) {
  const source = read(path);
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Expected one regex match in ${path}, found ${matches.length}`);
  write(path, source.replace(pattern, replacement));
}

const coordinatePlotPath = "src/core/board/coordinate-plot.ts";
replaceOnce(
  coordinatePlotPath,
  'import type { PlotParameterId, PlotSeriesId } from "./identifiers";\n',
  'import { reservedPlotExpressionNames } from "../plot-expression/functions";\nimport type { PlotParameterId, PlotSeriesId } from "./identifiers";\n',
);
replaceOnce(
  coordinatePlotPath,
  'const parameterNamePattern = /^[A-Za-z][A-Za-z0-9_]{0,31}$/u;\n',
  `export const plotParameterNamePattern = /^[A-Za-z][A-Za-z0-9_]{0,31}$/u;\n\nexport type PlotParameterNameIssueCode =\n  | "duplicate"\n  | "reserved"\n  | "syntax";\n\nexport function validatePlotParameterName(\n  name: string,\n  existingNames: readonly string[] = [],\n): PlotParameterNameIssueCode | null {\n  if (!plotParameterNamePattern.test(name)) return "syntax";\n  if (reservedPlotExpressionNames.has(name)) return "reserved";\n  return existingNames.includes(name) ? "duplicate" : null;\n}\n`,
);
replaceOnce(
  coordinatePlotPath,
  `    if (!parameterNamePattern.test(parameter.name)) {\n      add(\n        "plot.invalid-parameter-name",\n        \`parameters.\${index}.name\`,\n        "Parameter name must begin with a Latin letter and contain only letters, digits or underscores.",\n      );\n    }\n`,
  `    const nameIssue = validatePlotParameterName(parameter.name);\n    if (nameIssue === "syntax") {\n      add(\n        "plot.invalid-parameter-name",\n        \`parameters.\${index}.name\`,\n        "Parameter name must begin with a Latin letter and contain only letters, digits or underscores.",\n      );\n    } else if (nameIssue === "reserved") {\n      add(\n        "plot.reserved-parameter-name",\n        \`parameters.\${index}.name\`,\n        \`Parameter name \${parameter.name} is reserved by the expression language.\`,\n      );\n    }\n`,
);

const corePublicPath = "src/core/public.ts";
replaceOnce(
  corePublicPath,
  `  maximumPlotExpressionLength,\n  plotLegendPositions,\n`,
  `  maximumPlotExpressionLength,\n  plotLegendPositions,\n  plotParameterNamePattern,\n  validatePlotParameterName,\n`,
);
replaceOnce(
  corePublicPath,
  `  type PlotParameter,\n  type PlotSeries,\n`,
  `  type PlotParameter,\n  type PlotParameterNameIssueCode,\n  type PlotSeries,\n`,
);
replaceOnce(
  corePublicPath,
  `  maximumSamplePointsPerCoordinatePlot,\n  maximumSamplePointsPerSeries,\n`,
  `  maximumSamplePointsPerCoordinatePlot,\n  maximumSamplePointsPerSeries,\n  maximumSamplingEvaluationsPerCoordinatePlot,\n`,
);

const compilerPath = "src/core/plot-expression/compiler.ts";
replaceOnce(
  compilerPath,
  'import type { ExpressionNode } from "./ast";\n',
  'import { validatePlotParameterName } from "../board/coordinate-plot";\nimport type { ExpressionNode } from "./ast";\n',
);
replaceOnce(
  compilerPath,
  'const parameterNamePattern = /^[A-Za-z][A-Za-z0-9_]{0,31}$/u;\n\n',
  "",
);
replaceOnce(
  compilerPath,
  `  for (const parameterName of parameterNames) {\n    if (!parameterNamePattern.test(parameterName)) {\n      diagnostics.push(\n        expressionDiagnostic(\n          "expression.invalid-parameter-name",\n          \`Недопустимое имя параметра \${parameterName}.\`,\n          0,\n          0,\n        ),\n      );\n    } else if (reservedPlotExpressionNames.has(parameterName)) {\n      diagnostics.push(\n        expressionDiagnostic(\n          "expression.reserved-parameter-name",\n          \`Имя \${parameterName} зарезервировано языком выражений.\`,\n          0,\n          0,\n        ),\n      );\n    } else if (seen.has(parameterName)) {\n      diagnostics.push(\n        expressionDiagnostic(\n          "expression.duplicate-parameter-name",\n          \`Параметр \${parameterName} указан несколько раз.\`,\n          0,\n          0,\n        ),\n      );\n    }\n    seen.add(parameterName);\n  }\n`,
  `  for (const parameterName of parameterNames) {\n    const issue = validatePlotParameterName(parameterName, [...seen]);\n    if (issue === "syntax") {\n      diagnostics.push(\n        expressionDiagnostic(\n          "expression.invalid-parameter-name",\n          \`Недопустимое имя параметра \${parameterName}.\`,\n          0,\n          0,\n        ),\n      );\n    } else if (issue === "reserved") {\n      diagnostics.push(\n        expressionDiagnostic(\n          "expression.reserved-parameter-name",\n          \`Имя \${parameterName} зарезервировано языком выражений.\`,\n          0,\n          0,\n        ),\n      );\n    } else if (issue === "duplicate") {\n      diagnostics.push(\n        expressionDiagnostic(\n          "expression.duplicate-parameter-name",\n          \`Параметр \${parameterName} указан несколько раз.\`,\n          0,\n          0,\n        ),\n      );\n    }\n    seen.add(parameterName);\n  }\n`,
);

const limitsPath = "src/core/plot-sampling/limits.ts";
replaceOnce(
  limitsPath,
  "export const maximumSamplingEvaluationsPerSeries = 50_000;\n",
  "export const maximumSamplingEvaluationsPerSeries = 50_000;\nexport const maximumSamplingEvaluationsPerCoordinatePlot = 100_000;\n",
);

const samplingPublicPath = "src/core/plot-sampling/public.ts";
replaceOnce(
  samplingPublicPath,
  `  maximumSamplePointsPerCoordinatePlot,\n  maximumSamplePointsPerSeries,\n`,
  `  maximumSamplePointsPerCoordinatePlot,\n  maximumSamplePointsPerSeries,\n  maximumSamplingEvaluationsPerCoordinatePlot,\n`,
);

const samplingTypesPath = "src/core/plot-sampling/types.ts";
replaceOnce(
  samplingTypesPath,
  `  "sampling.total-point-limit",\n`,
  `  "sampling.total-evaluation-limit",\n  "sampling.total-point-limit",\n`,
);
replaceOnce(
  samplingTypesPath,
  `export interface CoordinatePlotSamplingOptions {\n  readonly maximumTotalPoints?: number | undefined;\n`,
  `export interface CoordinatePlotSamplingOptions {\n  readonly maximumTotalEvaluations?: number | undefined;\n  readonly maximumTotalPoints?: number | undefined;\n`,
);

const preparationPath = "src/core/plot-sampling/preparation.ts";
replaceOnce(
  preparationPath,
  `export function cacheKey(input: {\n  readonly boardZoom: number;\n  readonly bindings: Readonly<Record<string, number>>;\n`,
  `export function cacheKey(input: {\n  readonly bindingNames: readonly string[];\n  readonly boardZoom: number;\n  readonly bindings: Readonly<Record<string, number>>;\n`,
);
replaceOnce(
  preparationPath,
  `  return createPlotSamplingCacheKey({\n    bindings: input.bindings,\n`,
  `  const bindings = Object.fromEntries(\n    input.bindingNames.flatMap((name) =>\n      Object.hasOwn(input.bindings, name) ? [[name, input.bindings[name]!]] : [],\n    ),\n  );\n  return createPlotSamplingCacheKey({\n    bindings,\n`,
);
replaceOnce(
  preparationPath,
  `  | {\n      readonly domain: { readonly max: number; readonly min: number } | null;\n      readonly expression: CompiledPlotExpression;\n      readonly ok: true;\n`,
  `  | {\n      readonly bindingNames: readonly string[];\n      readonly domain: { readonly max: number; readonly min: number } | null;\n      readonly expression: CompiledPlotExpression;\n      readonly ok: true;\n`,
);
replaceOnce(
  preparationPath,
  `  if (!expression.ok) return expression;\n\n  const domainValues: { max?: number; min?: number } = {};\n`,
  `  if (!expression.ok) return expression;\n\n  const bindingNames = new Set(expression.expression.bindingNames);\n  bindingNames.delete("x");\n  const domainValues: { max?: number; min?: number } = {};\n`,
);
replaceOnce(
  preparationPath,
  `    if (!compiled.ok) {\n      diagnostics.push(...compiled.diagnostics);\n      continue;\n    }\n    const evaluated = evaluateScalar(\n`,
  `    if (!compiled.ok) {\n      diagnostics.push(...compiled.diagnostics);\n      continue;\n    }\n    compiled.expression.bindingNames.forEach((name) => bindingNames.add(name));\n    const evaluated = evaluateScalar(\n`,
);
replaceOnce(
  preparationPath,
  `  return {\n    domain: minimum < maximum ? { max: maximum, min: minimum } : null,\n    expression: expression.expression,\n    ok: true,\n  };\n`,
  `  return {\n    bindingNames: [...bindingNames].sort(),\n    domain: minimum < maximum ? { max: maximum, min: minimum } : null,\n    expression: expression.expression,\n    ok: true,\n  };\n`,
);
replaceOnce(
  preparationPath,
  `  | {\n      readonly ok: true;\n      readonly range: { readonly max: number; readonly min: number };\n`,
  `  | {\n      readonly bindingNames: readonly string[];\n      readonly ok: true;\n      readonly range: { readonly max: number; readonly min: number };\n`,
);
replaceOnce(
  preparationPath,
  `  return {\n    ok: true,\n    range: { max: maximumValue.value, min: minimumValue.value },\n`,
  `  const bindingNames = new Set(\n    [\n      ...xExpression.expression.bindingNames,\n      ...yExpression.expression.bindingNames,\n      ...minimum.expression.bindingNames,\n      ...maximum.expression.bindingNames,\n    ].filter((name) => name !== "t"),\n  );\n  return {\n    bindingNames: [...bindingNames].sort(),\n    ok: true,\n    range: { max: maximumValue.value, min: minimumValue.value },\n`,
);

const seriesSamplerPath = "src/core/plot-sampling/series-sampler.ts";
replaceRegexOnce(
  seriesSamplerPath,
  /export function sampleSeries\([\s\S]*$/,
  `export function sampleSeries(input: {\n  readonly bindings: Readonly<Record<string, number>>;\n  readonly definition: CoordinatePlotDefinition;\n  readonly options: PlotSamplingOptions | undefined;\n  readonly parameterNames: readonly string[];\n  readonly parent: CoordinatePlotSamplingInput;\n  readonly series: PlotSeries;\n}):\n  | {\n      readonly diagnostics: readonly PlotSamplingDiagnostic[];\n      readonly ok: false;\n    }\n  | {\n      readonly cacheHit: boolean;\n      readonly ok: true;\n      readonly sample: SampledPlotSeries;\n    } {\n  const compiled =\n    input.series.kind === "explicit"\n      ? compileExplicit({\n          bindings: input.bindings,\n          definition: input.definition,\n          parameterNames: input.parameterNames,\n          series: input.series,\n        })\n      : compileParametric({\n          bindings: input.bindings,\n          parameterNames: input.parameterNames,\n          series: input.series,\n        });\n  if (!compiled.ok) return compiled;\n\n  const key = cacheKey({\n    bindingNames: compiled.bindingNames,\n    bindings: input.bindings,\n    boardZoom: input.parent.boardZoom,\n    definition: input.definition,\n    options: input.options,\n    pixelSize: input.parent.pixelSize,\n    series: input.series,\n  });\n  const cached = input.parent.cache?.get(key);\n  if (cached !== undefined) return { cacheHit: true, ok: true, sample: cached };\n\n  const common = {\n    boardZoom: input.parent.boardZoom,\n    options: input.options,\n    parameters: input.bindings,\n    pixelSize: input.parent.pixelSize,\n    signal: input.parent.signal,\n    viewport: input.definition.coordinateViewport,\n  };\n  const sample =\n    input.series.kind === "explicit" && "expression" in compiled\n      ? compiled.domain === null\n        ? emptySample()\n        : sampleExplicitSeries({\n            ...common,\n            domain: compiled.domain,\n            expression: compiled.expression,\n          })\n      : input.series.kind === "parametric" && "xExpression" in compiled\n        ? sampleParametricSeries({\n            ...common,\n            closed: input.series.closed,\n            range: compiled.range,\n            xExpression: compiled.xExpression,\n            yExpression: compiled.yExpression,\n          })\n        : null;\n  if (sample === null) {\n    return {\n      diagnostics: [\n        diagnostic(\n          "sampling.expression-evaluation-failed",\n          "series",\n          "Compiled series kind did not match the source series.",\n        ),\n      ],\n      ok: false,\n    };\n  }\n  if (sample.stopReason !== "aborted") input.parent.cache?.set(key, sample);\n  return { cacheHit: false, ok: true, sample };\n}\n`,
);

write(
  "src/core/plot-sampling/coordinate-plot-sampler.ts",
  `import {\n  coordinatePlotSamplerVersion,\n  maximumSamplePointsPerCoordinatePlot,\n  maximumSamplePointsPerSeries,\n  maximumSamplingEvaluationsPerCoordinatePlot,\n  maximumSamplingEvaluationsPerSeries,\n} from "./limits";\nimport {\n  diagnostic,\n  invalidGeometryDiagnostics,\n  invalidParameterDiagnostics,\n  parameterBindings,\n} from "./preparation";\nimport { emptySample, resultStatus, sampleSeries } from "./series-sampler";\nimport type {\n  CoordinatePlotSamplingInput,\n  CoordinatePlotSamplingResult,\n  CoordinatePlotSeriesSamplingResult,\n  PlotSamplingStopReason,\n  SampledPlotSeries,\n} from "./types";\n\nfunction resolvedBudget(\n  requested: number | undefined,\n  fallback: number,\n  maximum: number,\n  minimum: number,\n): number {\n  return Math.max(\n    minimum,\n    Math.min(\n      maximum,\n      Math.floor(\n        requested !== undefined && Number.isFinite(requested)\n          ? requested\n          : fallback,\n      ),\n    ),\n  );\n}\n\nfunction exhaustedSample(reason: PlotSamplingStopReason): SampledPlotSeries {\n  return { ...emptySample(), stopReason: reason, truncated: true };\n}\n\nexport function sampleCoordinatePlotDefinition(\n  input: CoordinatePlotSamplingInput,\n): CoordinatePlotSamplingResult {\n  const geometryDiagnostics = invalidGeometryDiagnostics(input);\n  const parameterDiagnostics = invalidParameterDiagnostics(input.definition);\n  const commonDiagnostics = [...geometryDiagnostics, ...parameterDiagnostics];\n  const parameterNames = input.definition.parameters.map(({ name }) => name);\n  const bindings = parameterBindings(input.definition);\n  const totalPointLimit = resolvedBudget(\n    input.options?.maximumTotalPoints,\n    maximumSamplePointsPerCoordinatePlot,\n    maximumSamplePointsPerCoordinatePlot,\n    2,\n  );\n  const totalEvaluationLimit = resolvedBudget(\n    input.options?.maximumTotalEvaluations,\n    maximumSamplingEvaluationsPerCoordinatePlot,\n    maximumSamplingEvaluationsPerCoordinatePlot,\n    1,\n  );\n  const seriesPointLimit = resolvedBudget(\n    input.options?.sampling?.pointLimit,\n    maximumSamplePointsPerSeries,\n    maximumSamplePointsPerSeries,\n    2,\n  );\n  const seriesEvaluationLimit = resolvedBudget(\n    input.options?.sampling?.maximumEvaluations,\n    maximumSamplingEvaluationsPerSeries,\n    maximumSamplingEvaluationsPerSeries,\n    1,\n  );\n  const results: CoordinatePlotSeriesSamplingResult[] = [];\n  let totalPointCount = 0;\n  let consumedEvaluationCount = 0;\n  let cacheHits = 0;\n  let truncated = false;\n\n  for (const series of input.definition.series) {\n    if (!series.visible) {\n      results.push({\n        cacheHit: false,\n        diagnostics: [],\n        kind: series.kind,\n        sample: null,\n        seriesId: series.id,\n        status: "hidden",\n      });\n      continue;\n    }\n    if (commonDiagnostics.length > 0) {\n      results.push({\n        cacheHit: false,\n        diagnostics: commonDiagnostics,\n        kind: series.kind,\n        sample: null,\n        seriesId: series.id,\n        status: "invalid",\n      });\n      continue;\n    }\n\n    const remainingPoints = Math.max(0, totalPointLimit - totalPointCount);\n    const remainingEvaluations = Math.max(\n      0,\n      totalEvaluationLimit - consumedEvaluationCount,\n    );\n    if (remainingPoints < 2 || remainingEvaluations < 1) {\n      const pointLimitReached = remainingPoints < 2;\n      const reason = pointLimitReached ? "point-limit" : "evaluation-limit";\n      results.push({\n        cacheHit: false,\n        diagnostics: [\n          diagnostic(\n            pointLimitReached\n              ? "sampling.total-point-limit"\n              : "sampling.total-evaluation-limit",\n            "series",\n            pointLimitReached\n              ? "The coordinate plot reached its total sampled-point limit."\n              : "The coordinate plot reached its total evaluation limit.",\n          ),\n        ],\n        kind: series.kind,\n        sample: exhaustedSample(reason),\n        seriesId: series.id,\n        status: "truncated",\n      });\n      truncated = true;\n      continue;\n    }\n\n    const effectivePointLimit = Math.min(seriesPointLimit, remainingPoints);\n    const effectiveEvaluationLimit = Math.min(\n      seriesEvaluationLimit,\n      remainingEvaluations,\n    );\n    const sampled = sampleSeries({\n      bindings,\n      definition: input.definition,\n      options: {\n        ...input.options?.sampling,\n        maximumEvaluations: effectiveEvaluationLimit,\n        pointLimit: effectivePointLimit,\n      },\n      parameterNames,\n      parent: input,\n      series,\n    });\n    if (!sampled.ok) {\n      results.push({\n        cacheHit: false,\n        diagnostics: sampled.diagnostics,\n        kind: series.kind,\n        sample: null,\n        seriesId: series.id,\n        status: "invalid",\n      });\n      continue;\n    }\n\n    if (sampled.cacheHit) cacheHits += 1;\n    const sample = sampled.sample;\n    totalPointCount += sample.metrics.pointCount;\n    if (!sampled.cacheHit) {\n      consumedEvaluationCount += sample.metrics.evaluationCount;\n    }\n    const status = resultStatus(sample);\n    if (status === "truncated" || status === "aborted") truncated = true;\n    const diagnostics = [];\n    if (\n      sample.stopReason === "point-limit" &&\n      effectivePointLimit < seriesPointLimit\n    ) {\n      diagnostics.push(\n        diagnostic(\n          "sampling.total-point-limit",\n          "series",\n          "The coordinate plot reached its total sampled-point limit.",\n        ),\n      );\n    }\n    if (\n      sample.stopReason === "evaluation-limit" &&\n      effectiveEvaluationLimit < seriesEvaluationLimit\n    ) {\n      diagnostics.push(\n        diagnostic(\n          "sampling.total-evaluation-limit",\n          "series",\n          "The coordinate plot reached its total evaluation limit.",\n        ),\n      );\n    }\n    results.push({\n      cacheHit: sampled.cacheHit,\n      diagnostics,\n      kind: series.kind,\n      sample,\n      seriesId: series.id,\n      status,\n    });\n  }\n\n  return {\n    cacheHits,\n    samplerVersion: coordinatePlotSamplerVersion,\n    series: results,\n    totalPointCount,\n    truncated,\n  };\n}\n`,
);

const modelPath = "src/modules/coordinate-plot-editor/model.ts";
replaceOnce(
  modelPath,
  `  compilePlotExpression,\n  coordinatePlotExpressionLanguage,\n`,
  `  compilePlotExpression,\n  coordinatePlotExpressionLanguage,\n  evaluatePlotExpression,\n`,
);
replaceOnce(
  modelPath,
  `  validateCoordinatePlotDefinition,\n`,
  `  validateCoordinatePlotDefinition,\n  validatePlotParameterName,\n`,
);
replaceOnce(
  modelPath,
  `function nextParameterName(parameters: readonly PlotParameter[]): string {\n  const names = new Set(parameters.map(({ name }) => name));\n  for (const candidate of "abcdefghijklmnopqrstuvwxyz") {\n    if (!names.has(candidate) && candidate !== "e") return candidate;\n  }\n  let index = 1;\n  while (names.has(\`a\${index}\`)) index += 1;\n  return \`a\${index}\`;\n}\n\nfunction requestedParameterName(\n  parameters: readonly PlotParameter[],\n  requestedName: string | undefined,\n): string | null {\n  const name = requestedName?.trim() ?? "";\n  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;\n  return parameters.some((parameter) => parameter.name === name) ? null : name;\n}\n`,
  `function nextParameterName(parameters: readonly PlotParameter[]): string {\n  const names = parameters.map(({ name }) => name);\n  for (const candidate of "abcdefghijklmnopqrstuvwxyz") {\n    if (validatePlotParameterName(candidate, names) === null) return candidate;\n  }\n  let index = 1;\n  while (validatePlotParameterName(\`a\${index}\`, names) !== null) index += 1;\n  return \`a\${index}\`;\n}\n\nfunction requestedParameterName(\n  parameters: readonly PlotParameter[],\n  requestedName: string | undefined,\n): string | null {\n  const name = requestedName?.trim() ?? "";\n  return validatePlotParameterName(\n    name,\n    parameters.map((parameter) => parameter.name),\n  ) === null\n    ? name\n    : null;\n}\n`,
);
replaceRegexOnce(
  modelPath,
  /export function fitCoordinatePlotDefinition\([\s\S]*?\n}\n\nexport function resetCoordinatePlotViewport/,
  `const maximumFitExpansionFactor = 100;\n\nfunction evaluateFitBound(\n  source: string | null,\n  fallback: number,\n  parameterNames: readonly string[],\n  bindings: Readonly<Record<string, number>>,\n): number | null {\n  if (source === null) return fallback;\n  const compiled = compilePlotExpression(source, {\n    context: "explicit-domain",\n    parameterNames,\n  });\n  if (!compiled.ok) return null;\n  const evaluated = evaluatePlotExpression(compiled.expression, bindings);\n  return evaluated.kind === "value" && Number.isFinite(evaluated.value)\n    ? evaluated.value\n    : null;\n}\n\nfunction fitSamplingViewport(\n  definition: CoordinatePlotDefinition,\n): CoordinatePlotViewport {\n  const current = definition.coordinateViewport;\n  const parameterNames = definition.parameters.map(({ name }) => name);\n  const bindings = Object.fromEntries(\n    definition.parameters.map(({ name, value }) => [name, value]),\n  );\n  const ranges = definition.series.flatMap((series) => {\n    if (!series.visible || series.kind !== "explicit") return [];\n    const minimum = evaluateFitBound(\n      series.domain.minExpression,\n      current.xMin,\n      parameterNames,\n      bindings,\n    );\n    const maximum = evaluateFitBound(\n      series.domain.maxExpression,\n      current.xMax,\n      parameterNames,\n      bindings,\n    );\n    return minimum !== null && maximum !== null && minimum < maximum\n      ? [{ maximum, minimum }]\n      : [];\n  });\n  if (ranges.length === 0) return current;\n  const requestedMinimum = Math.min(...ranges.map(({ minimum }) => minimum));\n  const requestedMaximum = Math.max(...ranges.map(({ maximum }) => maximum));\n  const currentSpan = Math.max(1e-6, current.xMax - current.xMin);\n  const maximumSpan = currentSpan * maximumFitExpansionFactor;\n  const requestedSpan = requestedMaximum - requestedMinimum;\n  if (!(requestedSpan > maximumSpan)) {\n    return { ...current, xMax: requestedMaximum, xMin: requestedMinimum };\n  }\n  const center = (requestedMinimum + requestedMaximum) / 2;\n  return {\n    ...current,\n    xMax: center + maximumSpan / 2,\n    xMin: center - maximumSpan / 2,\n  };\n}\n\nfunction paddedFitRange(\n  minimum: number,\n  maximum: number,\n  referenceMinimum: number,\n  referenceMaximum: number,\n): { readonly maximum: number; readonly minimum: number } {\n  const rawSpan = Math.max(1e-6, maximum - minimum);\n  const padding = Math.max(rawSpan * 0.08, 0.25);\n  const paddedMinimum = minimum - padding;\n  const paddedMaximum = maximum + padding;\n  const referenceSpan = Math.max(1e-6, referenceMaximum - referenceMinimum);\n  const maximumSpan = referenceSpan * maximumFitExpansionFactor;\n  if (paddedMaximum - paddedMinimum <= maximumSpan) {\n    return { maximum: paddedMaximum, minimum: paddedMinimum };\n  }\n  const center = (minimum + maximum) / 2;\n  return {\n    maximum: center + maximumSpan / 2,\n    minimum: center - maximumSpan / 2,\n  };\n}\n\nexport function fitCoordinatePlotDefinition(\n  definition: CoordinatePlotDefinition,\n): CoordinatePlotDefinition {\n  const samplingViewport = fitSamplingViewport(definition);\n  const sampled = sampleCoordinatePlotDefinition({\n    boardZoom: 1,\n    definition: { ...definition, coordinateViewport: samplingViewport },\n    pixelSize: definition.size,\n  });\n  const bounds = sampled.series.flatMap(({ sample, status }) =>\n    sample?.dataBounds === null ||\n    sample?.dataBounds === undefined ||\n    (status !== "sampled" && status !== "truncated")\n      ? []\n      : [sample.dataBounds],\n  );\n  if (bounds.length === 0) return definition;\n  const x = paddedFitRange(\n    Math.min(...bounds.map((item) => item.xMin)),\n    Math.max(...bounds.map((item) => item.xMax)),\n    samplingViewport.xMin,\n    samplingViewport.xMax,\n  );\n  const y = paddedFitRange(\n    Math.min(...bounds.map((item) => item.yMin)),\n    Math.max(...bounds.map((item) => item.yMax)),\n    definition.coordinateViewport.yMin,\n    definition.coordinateViewport.yMax,\n  );\n  return {\n    ...definition,\n    coordinateViewport: {\n      ...definition.coordinateViewport,\n      xMax: x.maximum,\n      xMin: x.minimum,\n      yMax: y.maximum,\n      yMin: y.minimum,\n    },\n  };\n}\n\nexport function resetCoordinatePlotViewport`,
);

const rendererPath = "src/adapters/canvas-konva/coordinate-plot-renderer.tsx";
replaceOnce(
  rendererPath,
  `  useEffect(\n    () => () => {\n      cursorCleanupRef.current?.();\n      cursorCleanupRef.current = null;\n      cursorPressedRef.current = false;\n      if (cursorContainerRef.current !== null) {\n        cursorContainerRef.current.style.cursor = "";\n      }\n      cursorContainerRef.current = null;\n    },\n    [],\n  );\n`,
  `  useEffect(\n    () => () => {\n      cursorCleanupRef.current?.();\n      cursorCleanupRef.current = null;\n      cursorPressedRef.current = false;\n      if (cursorContainerRef.current !== null) {\n        cursorContainerRef.current.style.cursor = "";\n      }\n      cursorContainerRef.current = null;\n    },\n    [],\n  );\n  useEffect(() => {\n    if (editing) return;\n    viewportDragRef.current = null;\n    viewportPinchRef.current = null;\n    cursorPressedRef.current = false;\n    if (cursorContainerRef.current !== null) {\n      cursorContainerRef.current.style.cursor = "";\n    }\n  }, [editing]);\n`,
);

write(
  "src/app/CoordinatePlotNavigationControls.tsx",
  `import type {\n  KeyboardEvent as ReactKeyboardEvent,\n  PointerEvent as ReactPointerEvent,\n  ReactElement,\n} from "react";\n\nimport type { CoordinatePlotZoomAxis } from "../adapters/canvas-konva/public";\nimport "./CoordinatePlotNavigationControls.css";\n\nconst axisOptions: readonly {\n  readonly axis: CoordinatePlotZoomAxis;\n  readonly label: string;\n  readonly shortLabel: string;\n}[] = [\n  { axis: "both", label: "Обе оси", shortLabel: "XY" },\n  { axis: "x", label: "Только ось X", shortLabel: "X" },\n  { axis: "y", label: "Только ось Y", shortLabel: "Y" },\n];\n\nexport interface CoordinatePlotNavigationControlsProps {\n  readonly axis: CoordinatePlotZoomAxis;\n  readonly onAxisChange: (axis: CoordinatePlotZoomAxis) => void;\n  readonly onFit: () => void;\n  readonly onReset: () => void;\n  readonly onZoomIn: () => void;\n  readonly onZoomOut: () => void;\n}\n\nfunction focusAxisButton(\n  event: ReactKeyboardEvent<HTMLButtonElement>,\n  index: number,\n): void {\n  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(\n    '[role="radio"]',\n  );\n  buttons?.item(index).focus();\n}\n\nexport function CoordinatePlotNavigationControls({\n  axis,\n  onAxisChange,\n  onFit,\n  onReset,\n  onZoomIn,\n  onZoomOut,\n}: CoordinatePlotNavigationControlsProps): ReactElement {\n  const stopPointerPropagation = (event: ReactPointerEvent<HTMLElement>) =>\n    event.stopPropagation();\n  const handleAxisKeyDown = (\n    event: ReactKeyboardEvent<HTMLButtonElement>,\n    index: number,\n  ) => {\n    const last = axisOptions.length - 1;\n    const nextIndex =\n      event.key === "Home"\n        ? 0\n        : event.key === "End"\n          ? last\n          : event.key === "ArrowRight" || event.key === "ArrowDown"\n            ? (index + 1) % axisOptions.length\n            : event.key === "ArrowLeft" || event.key === "ArrowUp"\n              ? (index - 1 + axisOptions.length) % axisOptions.length\n              : null;\n    if (nextIndex === null) return;\n    event.preventDefault();\n    onAxisChange(axisOptions[nextIndex]!.axis);\n    focusAxisButton(event, nextIndex);\n  };\n\n  return (\n    <div\n      aria-label="Навигация координатной плоскости"\n      className="coordinate-plot-navigation"\n      data-testid="coordinate-plot-navigation"\n      onPointerDown={stopPointerPropagation}\n      role="toolbar"\n    >\n      <div\n        aria-label="Масштаб графика"\n        className="plot-navigation-actions"\n        role="group"\n      >\n        <button\n          aria-label="Приблизить график"\n          onClick={onZoomIn}\n          title="Приблизить"\n          type="button"\n        >\n          <span aria-hidden="true">+</span>\n        </button>\n        <button\n          aria-label="Отдалить график"\n          onClick={onZoomOut}\n          title="Отдалить"\n          type="button"\n        >\n          <span aria-hidden="true">−</span>\n        </button>\n        <button\n          aria-label="Сбросить диапазон графика"\n          onClick={onReset}\n          type="button"\n        >\n          Сброс\n        </button>\n        <button aria-label="Вместить все графики" onClick={onFit} type="button">\n          Вместить\n        </button>\n      </div>\n      <div\n        aria-label="Ось масштабирования"\n        className="plot-navigation-axis"\n        role="radiogroup"\n      >\n        {axisOptions.map((option, index) => (\n          <button\n            aria-checked={axis === option.axis}\n            aria-label={option.label}\n            className={axis === option.axis ? "is-active" : undefined}\n            key={option.axis}\n            onClick={() => onAxisChange(option.axis)}\n            onKeyDown={(event) => handleAxisKeyDown(event, index)}\n            role="radio"\n            tabIndex={axis === option.axis ? 0 : -1}\n            type="button"\n          >\n            {option.shortLabel}\n          </button>\n        ))}\n      </div>\n    </div>\n  );\n}\n`,
);

const panelPath = "src/app/CoordinatePlotEditorPanel.tsx";
replaceOnce(
  panelPath,
  `  type KeyboardEvent as ReactKeyboardEvent,\n  type ReactElement,\n`,
  `  type InputHTMLAttributes,\n  type KeyboardEvent as ReactKeyboardEvent,\n  type ReactElement,\n`,
);
replaceOnce(
  panelPath,
  `function nullableNumber(value: string): number | null {\n  if (value.trim() === "") return null;\n  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : null;\n}\n\n`,
  `function nullableNumber(value: string): number | null {\n  if (value.trim() === "") return null;\n  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : null;\n}\n\nfunction NumberDraftInput({\n  inputProps = {},\n  nullable = false,\n  onCommit,\n  value,\n}: {\n  readonly inputProps?: Omit<\n    InputHTMLAttributes<HTMLInputElement>,\n    "onBlur" | "onChange" | "onKeyDown" | "type" | "value"\n  >;\n  readonly nullable?: boolean;\n  readonly onCommit: (value: number | null) => void;\n  readonly value: number | null;\n}): ReactElement {\n  const format = (current: number | null) =>\n    current === null ? "" : String(current);\n  const [draft, setDraft] = useState(() => format(value));\n  const focusedRef = useRef(false);\n  useEffect(() => {\n    if (!focusedRef.current) setDraft(format(value));\n  }, [value]);\n\n  const commit = () => {\n    const trimmed = draft.trim();\n    if (nullable && trimmed === "") {\n      onCommit(null);\n      return;\n    }\n    const parsed = Number(trimmed);\n    if (trimmed !== "" && Number.isFinite(parsed)) {\n      onCommit(parsed);\n      setDraft(String(parsed));\n      return;\n    }\n    setDraft(format(value));\n  };\n\n  return (\n    <input\n      {...inputProps}\n      inputMode="decimal"\n      onBlur={() => {\n        focusedRef.current = false;\n        commit();\n      }}\n      onChange={(event) => setDraft(event.currentTarget.value)}\n      onFocus={() => {\n        focusedRef.current = true;\n      }}\n      onKeyDown={(event) => {\n        if (event.key === "Enter") {\n          event.preventDefault();\n          event.currentTarget.blur();\n        }\n      }}\n      type="text"\n      value={draft}\n    />\n  );\n}\n\n`,
);
replaceOnce(
  panelPath,
  `          <input\n            onChange={(event) =>\n              replace({\n                ...parameter,\n                value: numberValue(event.currentTarget.value, parameter.value),\n              })\n            }\n            step="any"\n            type="number"\n            value={parameter.value}\n          />\n`,
  `          <NumberDraftInput\n            inputProps={{ "aria-label": "Значение" }}\n            onCommit={(value) => {\n              if (value !== null) replace({ ...parameter, value });\n            }}\n            value={parameter.value}\n          />\n`,
);
replaceOnce(
  panelPath,
  `          <input\n            {...issueAttributes(issues, prefix, rangeIssueId, false)}\n            aria-label="Минимум"\n            onChange={(event) =>\n              replace({\n                ...parameter,\n                min: nullableNumber(event.currentTarget.value),\n              })\n            }\n            step="any"\n            type="number"\n            value={parameter.min ?? ""}\n          />\n`,
  `          <NumberDraftInput\n            inputProps={{\n              ...issueAttributes(issues, prefix, rangeIssueId, false),\n              "aria-label": "Минимум",\n            }}\n            nullable\n            onCommit={(min) => replace({ ...parameter, min })}\n            value={parameter.min}\n          />\n`,
);
replaceOnce(
  panelPath,
  `          <input\n            {...issueAttributes(issues, prefix, rangeIssueId, false)}\n            aria-label="Максимум"\n            onChange={(event) =>\n              replace({\n                ...parameter,\n                max: nullableNumber(event.currentTarget.value),\n              })\n            }\n            step="any"\n            type="number"\n            value={parameter.max ?? ""}\n          />\n`,
  `          <NumberDraftInput\n            inputProps={{\n              ...issueAttributes(issues, prefix, rangeIssueId, false),\n              "aria-label": "Максимум",\n            }}\n            nullable\n            onCommit={(max) => replace({ ...parameter, max })}\n            value={parameter.max}\n          />\n`,
);
replaceOnce(
  panelPath,
  `          <input\n            {...issueAttributes(issues, \`\${prefix}.step\`, stepIssueId, false)}\n            min="0"\n            onChange={(event) =>\n              replace({\n                ...parameter,\n                step: nullableNumber(event.currentTarget.value),\n              })\n            }\n            step="any"\n            type="number"\n            value={parameter.step ?? ""}\n          />\n`,
  `          <NumberDraftInput\n            inputProps={{\n              ...issueAttributes(\n                issues,\n                \`\${prefix}.step\`,\n                stepIssueId,\n                false,\n              ),\n              min: "0",\n            }}\n            nullable\n            onCommit={(step) => replace({ ...parameter, step })}\n            value={parameter.step}\n          />\n`,
);
replaceOnce(
  panelPath,
  `              <input\n                {...issueAttributes(\n                  issues,\n                  "coordinateViewport",\n                  viewportIssueId,\n                )}\n                aria-label={ariaLabel}\n                onChange={(event) =>\n                  onChange(\n                    updateViewport(\n                      definition,\n                      key,\n                      numberValue(\n                        event.currentTarget.value,\n                        definition.coordinateViewport[key],\n                      ),\n                    ),\n                  )\n                }\n                step="any"\n                type="number"\n                value={definition.coordinateViewport[key]}\n              />\n`,
  `              <NumberDraftInput\n                inputProps={{\n                  ...issueAttributes(\n                    issues,\n                    "coordinateViewport",\n                    viewportIssueId,\n                  ),\n                  "aria-label": ariaLabel,\n                }}\n                onCommit={(value) => {\n                  if (value !== null) {\n                    onChange(updateViewport(definition, key, value));\n                  }\n                }}\n                value={definition.coordinateViewport[key]}\n              />\n`,
);
replaceOnce(
  panelPath,
  `              <input\n                {...issueAttributes(issues, "grid", gridIssueId)}\n                min="0.000000001"\n                onChange={(event) =>\n                  onChange({\n                    ...definition,\n                    grid: {\n                      ...definition.grid,\n                      xStep: numberValue(\n                        event.currentTarget.value,\n                        definition.grid.xStep ?? 1,\n                      ),\n                    },\n                  })\n                }\n                step="any"\n                type="number"\n                value={definition.grid.xStep ?? 1}\n              />\n`,
  `              <NumberDraftInput\n                inputProps={{\n                  ...issueAttributes(issues, "grid", gridIssueId),\n                  min: "0.000000001",\n                }}\n                onCommit={(xStep) => {\n                  if (xStep !== null) {\n                    onChange({\n                      ...definition,\n                      grid: { ...definition.grid, xStep },\n                    });\n                  }\n                }}\n                value={definition.grid.xStep ?? 1}\n              />\n`,
);
replaceOnce(
  panelPath,
  `              <input\n                {...issueAttributes(issues, "grid", gridIssueId)}\n                min="0.000000001"\n                onChange={(event) =>\n                  onChange({\n                    ...definition,\n                    grid: {\n                      ...definition.grid,\n                      yStep: numberValue(\n                        event.currentTarget.value,\n                        definition.grid.yStep ?? 1,\n                      ),\n                    },\n                  })\n                }\n                step="any"\n                type="number"\n                value={definition.grid.yStep ?? 1}\n              />\n`,
  `              <NumberDraftInput\n                inputProps={{\n                  ...issueAttributes(issues, "grid", gridIssueId),\n                  min: "0.000000001",\n                }}\n                onCommit={(yStep) => {\n                  if (yStep !== null) {\n                    onChange({\n                      ...definition,\n                      grid: { ...definition.grid, yStep },\n                    });\n                  }\n                }}\n                value={definition.grid.yStep ?? 1}\n              />\n`,
);

const modelTestPath = "tests/unit/modules/coordinate-plot-editor/model.test.ts";
replaceOnce(
  modelTestPath,
  `  it("switches a series kind while preserving identity and style", () => {\n`,
  `  it("skips expression-language reserved names during automatic generation", () => {\n    let definition = createPlot().definition;\n    const names: string[] = [];\n    for (let index = 0; index < 26; index += 1) {\n      definition = addCoordinatePlotParameter(\n        definition,\n        plotParameterId(\`parameter-generated-\${index}\`),\n      );\n      names.push(definition.parameters.at(-1)!.name);\n    }\n\n    expect(names).not.toContain("e");\n    expect(names).not.toContain("t");\n    expect(names).not.toContain("x");\n    expect(new Set(names).size).toBe(names.length);\n  });\n\n  it("switches a series kind while preserving identity and style", () => {\n`,
);
replaceOnce(
  modelTestPath,
  `  it("fits sampled geometry with padding", () => {\n`,
  `  it("fits an explicit domain that starts outside the current viewport", () => {\n    const plot = createPlot();\n    const explicit = plot.definition.series[0]!;\n    if (explicit.kind !== "explicit") throw new Error("Expected explicit series.");\n    const fitted = fitCoordinatePlotDefinition({\n      ...plot.definition,\n      series: [\n        {\n          ...explicit,\n          domain: { maxExpression: "30", minExpression: "20" },\n          expression: "x",\n        },\n      ],\n    });\n\n    expect(fitted.coordinateViewport.xMin).toBeLessThan(20);\n    expect(fitted.coordinateViewport.xMax).toBeGreaterThan(30);\n  });\n\n  it("fits sampled geometry with padding", () => {\n`,
);

const compilerTestPath = "tests/unit/core/plot-expression/compiler.test.ts";
replaceOnce(
  compilerTestPath,
  `    const invalid = compilePlotExpression("1", {\n      context: "explicit-domain",\n      parameterNames: ["1a"],\n    });\n`,
  `    const invalid = compilePlotExpression("1", {\n      context: "explicit-domain",\n      parameterNames: ["1a"],\n    });\n    const leadingUnderscore = compilePlotExpression("1", {\n      context: "explicit-domain",\n      parameterNames: ["_a"],\n    });\n`,
);
replaceOnce(
  compilerTestPath,
  `    expect(invalid.ok).toBe(false);\n    expect(duplicate.ok).toBe(false);\n`,
  `    expect(invalid.ok).toBe(false);\n    expect(leadingUnderscore.ok).toBe(false);\n    expect(duplicate.ok).toBe(false);\n`,
);

const samplingTestPath = "tests/unit/core/plot-sampling/coordinate-plot-sampler.test.ts";
replaceOnce(
  samplingTestPath,
  `  it("enforces the per-plane point budget across sibling series", () => {\n`,
  `  it("keeps cache hits for series that do not use the changed parameter", () => {\n    const cache = createPlotSamplingCache();\n    const firstDefinition = definition();\n    const first = sampleCoordinatePlotDefinition({\n      ...baseInput,\n      cache,\n      definition: firstDefinition,\n    });\n    const second = sampleCoordinatePlotDefinition({\n      ...baseInput,\n      cache,\n      definition: {\n        ...firstDefinition,\n        parameters: firstDefinition.parameters.map((parameter) => ({\n          ...parameter,\n          value: parameter.value + 1,\n        })),\n      },\n    });\n\n    expect(first.cacheHits).toBe(0);\n    expect(second.series[0]!.cacheHit).toBe(false);\n    expect(second.series[2]!.cacheHit).toBe(true);\n  });\n\n  it("enforces an evaluation budget before sampling later siblings", () => {\n    const result = sampleCoordinatePlotDefinition({\n      ...baseInput,\n      definition: definition(),\n      options: { maximumTotalEvaluations: 10 },\n    });\n    const evaluations = result.series.reduce(\n      (total, item) => total + (item.sample?.metrics.evaluationCount ?? 0),\n      0,\n    );\n\n    expect(evaluations).toBeLessThanOrEqual(10);\n    expect(result.truncated).toBe(true);\n    expect(\n      result.series.some(({ diagnostics }) =>\n        diagnostics.some(\n          ({ code }) => code === "sampling.total-evaluation-limit",\n        ),\n      ),\n    ).toBe(true);\n  });\n\n  it("enforces the per-plane point budget across sibling series", () => {\n`,
);

const navTestPath = "src/app/CoordinatePlotNavigationControls.test.tsx";
replaceOnce(
  navTestPath,
  `    fireEvent.click(screen.getByRole("radio", { name: "Только ось X" }));\n\n    expect(onZoomIn).toHaveBeenCalledOnce();\n`,
  `    const both = screen.getByRole("radio", { name: "Обе оси" });\n    const xOnly = screen.getByRole("radio", { name: "Только ось X" });\n    fireEvent.click(xOnly);\n    both.focus();\n    fireEvent.keyDown(both, { key: "ArrowRight" });\n\n    expect(onZoomIn).toHaveBeenCalledOnce();\n`,
);
replaceOnce(
  navTestPath,
  `    expect(onAxisChange).toHaveBeenCalledWith("x");\n`,
  `    expect(onAxisChange).toHaveBeenCalledWith("x");\n    expect(xOnly).toHaveFocus();\n`,
);

const panelTestPath = "src/app/CoordinatePlotEditorPanel.test.tsx";
replaceOnce(
  panelTestPath,
  `  it("inserts functions around the selected expression and explains radians", async () => {\n`,
  `  it("preserves intermediate numeric text until the field is committed", () => {\n    render(<PanelHarness />);\n    fireEvent.click(screen.getByRole("tab", { name: "Вид" }));\n    const minimumX = inputByLabel("Минимальная граница X");\n\n    fireEvent.change(minimumX, { target: { value: "-" } });\n    expect(minimumX).toHaveValue("-");\n    fireEvent.change(minimumX, { target: { value: "-12.5" } });\n    fireEvent.blur(minimumX);\n    expect(minimumX).toHaveValue("-12.5");\n  });\n\n  it("inserts functions around the selected expression and explains radians", async () => {\n`,
);

write(
  "docs/architecture/COORDINATE_PLOT_REVIEW_REMEDIATION_PLAN.md",
  `# Coordinate plot review remediation plan\n\n## Goal\n\nClose the runtime, domain-consistency, fit, cache, numeric-input and accessibility findings identified after UX PR 3 while preserving BoardDocument 1.1, the expression language and semantic update-command contracts.\n\n## Workstreams\n\n### 1. Bound work before execution\n\n- Add a coordinate-plane evaluation ceiling in addition to the existing point ceiling.\n- Derive per-series point and evaluation limits from the remaining plane budget before sampling starts.\n- Skip later visible series with an explicit truncated result once either budget is exhausted.\n- Count cache hits as zero evaluation work for the current render.\n- Keep cancellation support available for callers and retain the existing per-series limits.\n\n### 2. Unify parameter-name validation\n\n- Make the board domain the public source of truth for syntax, reserved names and duplicates.\n- Reuse the same validator in the expression compiler and editor model.\n- Prevent automatic names from producing x, t, e or function names.\n- Keep reserved-name failures structural so invalid environments cannot be persisted.\n\n### 3. Make fit domain-aware and bounded\n\n- Evaluate finite explicit-domain expressions against current parameter bindings.\n- Sample bounded explicit functions over those domains even when they are outside the current viewport.\n- Preserve the current range for unbounded definitions.\n- Cap expansion to a documented factor to contain extreme finite values and asymptotic outliers.\n\n### 4. Preserve unaffected cache entries\n\n- Compile a series before deriving its cache key.\n- Include only parameter bindings referenced by the compiled formula, domain or range.\n- Retain viewport, pixel size, zoom, options, geometry and sampler version in the key.\n\n### 5. Stabilize editor and canvas interaction\n\n- Keep numeric values as local text while the user enters signs, decimals or exponent prefixes.\n- Commit finite numbers on blur or Enter and restore the last committed value after invalid input.\n- Add complete arrow, Home and End navigation to the zoom-axis radiogroup.\n- Clear the Konva container cursor whenever internal plot editing ends.\n\n## Verification matrix\n\n- Domain and compiler tests for reserved, duplicate and underscore-prefixed names.\n- Editor-model tests for more than one alphabet cycle of generated parameter names.\n- Sampler tests for pre-execution evaluation limits and unused-binding cache hits.\n- Fit tests for explicit domains outside the visible X range.\n- React tests for numeric draft preservation and radiogroup keyboard navigation.\n- Existing quality, unit, integration, performance, browser and production-image gates remain required.\n`,
);

write(
  "docs/adr/ADR-020-coordinate-plot-review-remediation.md",
  `# ADR-020: Coordinate plot runtime and editor remediation\n\n- Status: Accepted\n- Date: 2026-08-01\n- Scope: expression parameter environments, sampling orchestration, fit, cache and editor interaction\n\n## Decision\n\n1. Plane-level point and evaluation budgets are applied before each series starts.\n2. Cached samples consume output-point capacity while contributing zero evaluation work to the current render.\n3. Parameter names use one domain validator covering syntax, reserved language names and duplicates.\n4. Series cache keys contain only bindings referenced by compiled expressions.\n5. Fit evaluates explicit domain bounds, samples over the resolved finite range and limits viewport expansion to one hundred times the reference span.\n6. Numeric editor controls retain textual drafts and commit finite values on blur or Enter.\n7. The zoom-axis radiogroup implements keyboard navigation, and renderer cursor state is cleared when editing ends.\n\n## Consequences\n\n- Worst-case synchronous sampling work is bounded independently of the number of valid series.\n- Changing an unrelated parameter preserves reusable series samples.\n- Generated and manually entered parameter names follow the same expression-language contract.\n- Fit can discover bounded functions outside the current viewport while extreme values remain contained.\n- Intermediate numeric input remains stable and keyboard interaction follows radiogroup semantics.\n- BoardDocument remains version 1.1 and no persisted field is added.\n`,
);
