import type { ExpressionNode } from "./ast";

export const plotExpressionContexts = [
  "explicit-function",
  "explicit-domain",
  "parametric-x",
  "parametric-y",
  "parametric-range",
  "relation-side",
] as const;

export type PlotExpressionContext = (typeof plotExpressionContexts)[number];

export const expressionDiagnosticCodes = [
  "expression.empty",
  "expression.unexpected-character",
  "expression.unexpected-token",
  "expression.expected-expression",
  "expression.expected-closing-parenthesis",
  "expression.unknown-identifier",
  "expression.reserved-parameter-name",
  "expression.invalid-parameter-name",
  "expression.duplicate-parameter-name",
  "expression.invalid-function-arity",
  "expression.variable-not-allowed",
  "expression.function-requires-parentheses",
  "expression.expression-too-long",
  "expression.too-many-tokens",
  "expression.ast-too-deep",
  "expression.too-many-nodes",
  "expression.invalid-number",
  "expression.complexity-limit",
] as const;

export type ExpressionDiagnosticCode =
  (typeof expressionDiagnosticCodes)[number];

export interface ExpressionDiagnostic {
  readonly code: ExpressionDiagnosticCode;
  readonly end: number;
  readonly message: string;
  readonly severity: "error";
  readonly start: number;
}

export interface CompilePlotExpressionOptions {
  readonly context: PlotExpressionContext;
  readonly parameterNames: readonly string[];
}

const compiledPlotExpressionBrand: unique symbol = Symbol(
  "CompiledPlotExpression",
);

export interface CompiledPlotExpression {
  readonly [compiledPlotExpressionBrand]: true;
  readonly context: PlotExpressionContext;
  readonly normalizedSource: string;
  readonly source: string;
}

interface InternalCompiledPlotExpression extends CompiledPlotExpression {
  readonly ast: ExpressionNode;
  readonly bindingNames: readonly string[];
}

export type CompilePlotExpressionResult =
  | {
      readonly expression: CompiledPlotExpression;
      readonly ok: true;
    }
  | {
      readonly diagnostics: readonly ExpressionDiagnostic[];
      readonly ok: false;
    };

export type PlotEvaluationUndefinedReason =
  "division-by-zero" | "domain" | "non-finite";

export type PlotEvaluationResult =
  | {
      readonly kind: "value";
      readonly value: number;
    }
  | {
      readonly kind: "undefined";
      readonly reason: PlotEvaluationUndefinedReason;
    }
  | {
      readonly kind: "budget-exceeded";
    }
  | {
      readonly kind: "missing-bindings";
      readonly names: readonly string[];
    };

export function createCompiledPlotExpression(input: {
  readonly ast: ExpressionNode;
  readonly bindingNames: readonly string[];
  readonly context: PlotExpressionContext;
  readonly normalizedSource: string;
  readonly source: string;
}): CompiledPlotExpression {
  return {
    [compiledPlotExpressionBrand]: true,
    ...input,
  };
}

export function compiledPlotExpressionAst(
  expression: CompiledPlotExpression,
): ExpressionNode {
  return (expression as InternalCompiledPlotExpression).ast;
}

export function compiledPlotExpressionBindingNames(
  expression: CompiledPlotExpression,
): readonly string[] {
  return (expression as InternalCompiledPlotExpression).bindingNames;
}
