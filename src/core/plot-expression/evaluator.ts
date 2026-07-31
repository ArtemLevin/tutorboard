import type { ExpressionNode } from "./ast";
import {
  isUnaryPlotFunctionName,
  isVariadicPlotFunctionName,
  type UnaryPlotFunctionName,
} from "./functions";
import { maximumEvaluationOperations } from "./limits";
import {
  compiledPlotExpressionAst,
  compiledPlotExpressionBindingNames,
  type CompiledPlotExpression,
  type PlotEvaluationResult,
  type PlotEvaluationUndefinedReason,
} from "./types";

interface EvaluationState {
  operations: number;
}

type InternalEvaluationResult =
  | { readonly kind: "value"; readonly value: number }
  | {
      readonly kind: "undefined";
      readonly reason: PlotEvaluationUndefinedReason;
    }
  | { readonly kind: "budget-exceeded" };

function undefinedResult(
  reason: PlotEvaluationUndefinedReason,
): InternalEvaluationResult {
  return { kind: "undefined", reason };
}

function finiteResult(value: number): InternalEvaluationResult {
  if (Number.isNaN(value)) return undefinedResult("domain");
  if (!Number.isFinite(value)) return undefinedResult("non-finite");
  return { kind: "value", value };
}

function evaluateUnaryFunction(
  name: UnaryPlotFunctionName,
  value: number,
): InternalEvaluationResult {
  if (name === "sqrt" && value < 0) return undefinedResult("domain");
  if ((name === "ln" || name === "log") && value <= 0) {
    return undefinedResult("domain");
  }
  if ((name === "asin" || name === "acos") && (value < -1 || value > 1)) {
    return undefinedResult("domain");
  }

  const result = {
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    ceil: Math.ceil,
    cos: Math.cos,
    exp: Math.exp,
    floor: Math.floor,
    ln: Math.log,
    log: Math.log10,
    sin: Math.sin,
    sqrt: Math.sqrt,
    tan: Math.tan,
  } satisfies Record<UnaryPlotFunctionName, (input: number) => number>;
  return finiteResult(result[name](value));
}

function evaluateNode(
  node: ExpressionNode,
  bindings: Readonly<Record<string, number>>,
  state: EvaluationState,
): InternalEvaluationResult {
  state.operations += 1;
  if (state.operations > maximumEvaluationOperations) {
    return { kind: "budget-exceeded" };
  }

  switch (node.kind) {
    case "number":
      return { kind: "value", value: node.value };
    case "variable": {
      if (node.name === "pi") return { kind: "value", value: Math.PI };
      if (node.name === "e") return { kind: "value", value: Math.E };
      return finiteResult(bindings[node.name]!);
    }
    case "unary": {
      const operand = evaluateNode(node.operand, bindings, state);
      if (operand.kind !== "value") return operand;
      return finiteResult(
        node.operator === "+" ? operand.value : -operand.value,
      );
    }
    case "binary": {
      const left = evaluateNode(node.left, bindings, state);
      if (left.kind !== "value") return left;
      const right = evaluateNode(node.right, bindings, state);
      if (right.kind !== "value") return right;
      if (node.operator === "/" && right.value === 0) {
        return undefinedResult("division-by-zero");
      }
      const value = {
        "+": () => left.value + right.value,
        "-": () => left.value - right.value,
        "*": () => left.value * right.value,
        "/": () => left.value / right.value,
        "^": () => left.value ** right.value,
      } satisfies Record<typeof node.operator, () => number>;
      return finiteResult(value[node.operator]());
    }
    case "function-call": {
      const values: number[] = [];
      for (const argument of node.arguments) {
        const evaluated = evaluateNode(argument, bindings, state);
        if (evaluated.kind !== "value") return evaluated;
        values.push(evaluated.value);
      }
      if (isUnaryPlotFunctionName(node.name)) {
        return evaluateUnaryFunction(node.name, values[0]!);
      }
      if (isVariadicPlotFunctionName(node.name)) {
        return finiteResult(
          node.name === "min" ? Math.min(...values) : Math.max(...values),
        );
      }
      return undefinedResult("domain");
    }
  }
}

export function evaluatePlotExpression(
  expression: CompiledPlotExpression,
  bindings: Readonly<Record<string, number>>,
): PlotEvaluationResult {
  const bindingNames = compiledPlotExpressionBindingNames(expression);
  const missing = bindingNames.filter((name) => !Object.hasOwn(bindings, name));
  if (missing.length > 0) return { kind: "missing-bindings", names: missing };

  for (const name of bindingNames) {
    if (!Number.isFinite(bindings[name])) {
      return { kind: "undefined", reason: "non-finite" };
    }
  }
  return evaluateNode(compiledPlotExpressionAst(expression), bindings, {
    operations: 0,
  });
}
