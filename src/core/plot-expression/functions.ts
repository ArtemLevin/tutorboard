export const unaryPlotFunctionNames = [
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sqrt",
  "abs",
  "exp",
  "ln",
  "log",
  "floor",
  "ceil",
] as const;

export const variadicPlotFunctionNames = ["min", "max"] as const;

export type UnaryPlotFunctionName = (typeof unaryPlotFunctionNames)[number];
export type VariadicPlotFunctionName =
  (typeof variadicPlotFunctionNames)[number];
export type PlotFunctionName = UnaryPlotFunctionName | VariadicPlotFunctionName;

const unaryNameSet = new Set<string>(unaryPlotFunctionNames);
const variadicNameSet = new Set<string>(variadicPlotFunctionNames);

export function isPlotFunctionName(value: string): value is PlotFunctionName {
  return unaryNameSet.has(value) || variadicNameSet.has(value);
}

export function isUnaryPlotFunctionName(
  value: string,
): value is UnaryPlotFunctionName {
  return unaryNameSet.has(value);
}

export function isVariadicPlotFunctionName(
  value: string,
): value is VariadicPlotFunctionName {
  return variadicNameSet.has(value);
}

export const reservedPlotExpressionNames = new Set<string>([
  "x",
  "t",
  "pi",
  "e",
  ...unaryPlotFunctionNames,
  ...variadicPlotFunctionNames,
]);
