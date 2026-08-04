import { validatePlotParameterName } from "../board/coordinate-plot";
import type { ExpressionNode } from "./ast";
import { expressionDiagnostic } from "./diagnostics";
import {
  isUnaryPlotFunctionName,
  isVariadicPlotFunctionName,
  reservedPlotExpressionNames,
} from "./functions";
import { maximumExpressionLength } from "./limits";
import { parsePlotExpression } from "./parser";
import { tokenizePlotExpression } from "./tokenizer";
import {
  createCompiledPlotExpression,
  type CompilePlotExpressionOptions,
  type CompilePlotExpressionResult,
  type ExpressionDiagnostic,
} from "./types";

function allowedIndependentVariables(
  context: CompilePlotExpressionOptions["context"],
): ReadonlySet<string> {
  if (context === "explicit-function") return new Set(["x"]);
  if (context === "parametric-x" || context === "parametric-y") {
    return new Set(["t"]);
  }
  if (context === "relation-side") return new Set(["x", "y"]);
  return new Set();
}

function validateParameterNames(
  parameterNames: readonly string[],
): readonly ExpressionDiagnostic[] {
  const diagnostics: ExpressionDiagnostic[] = [];
  const seen = new Set<string>();
  for (const parameterName of parameterNames) {
    const issue = validatePlotParameterName(parameterName, [...seen]);
    if (issue === "syntax") {
      diagnostics.push(
        expressionDiagnostic(
          "expression.invalid-parameter-name",
          `Недопустимое имя параметра ${parameterName}.`,
          0,
          0,
        ),
      );
    } else if (issue === "reserved") {
      diagnostics.push(
        expressionDiagnostic(
          "expression.reserved-parameter-name",
          `Имя ${parameterName} зарезервировано языком выражений.`,
          0,
          0,
        ),
      );
    } else if (issue === "duplicate") {
      diagnostics.push(
        expressionDiagnostic(
          "expression.duplicate-parameter-name",
          `Параметр ${parameterName} указан несколько раз.`,
          0,
          0,
        ),
      );
    }
    seen.add(parameterName);
  }
  return diagnostics;
}

function validateAst(
  ast: ExpressionNode,
  options: CompilePlotExpressionOptions,
  parameters: ReadonlySet<string>,
): readonly ExpressionDiagnostic[] {
  const diagnostics: ExpressionDiagnostic[] = [];
  const independentVariables = allowedIndependentVariables(options.context);

  const visit = (node: ExpressionNode): void => {
    switch (node.kind) {
      case "number":
        return;
      case "unary":
        visit(node.operand);
        return;
      case "binary":
        visit(node.left);
        visit(node.right);
        return;
      case "function-call": {
        const arity = node.arguments.length;
        if (isUnaryPlotFunctionName(node.name) && arity !== 1) {
          diagnostics.push(
            expressionDiagnostic(
              "expression.invalid-function-arity",
              `Функция ${node.name} ожидает один аргумент.`,
              node.start,
              node.end,
            ),
          );
        } else if (isVariadicPlotFunctionName(node.name) && arity < 2) {
          diagnostics.push(
            expressionDiagnostic(
              "expression.invalid-function-arity",
              `Функция ${node.name} ожидает от двух аргументов.`,
              node.start,
              node.end,
            ),
          );
        }
        node.arguments.forEach(visit);
        return;
      }
      case "variable": {
        if (node.name === "pi" || node.name === "e") return;
        if (node.name === "x" || node.name === "y" || node.name === "t") {
          if (!independentVariables.has(node.name)) {
            diagnostics.push(
              expressionDiagnostic(
                "expression.variable-not-allowed",
                `Переменная ${node.name} недоступна в этом выражении.`,
                node.start,
                node.end,
              ),
            );
          }
          return;
        }
        if (reservedPlotExpressionNames.has(node.name)) {
          diagnostics.push(
            expressionDiagnostic(
              "expression.function-requires-parentheses",
              `Функцию ${node.name} следует вызывать со скобками.`,
              node.start,
              node.end,
            ),
          );
          return;
        }
        if (!parameters.has(node.name)) {
          diagnostics.push(
            expressionDiagnostic(
              "expression.unknown-identifier",
              `Неизвестная переменная ${node.name}.`,
              node.start,
              node.end,
            ),
          );
        }
      }
    }
  };

  visit(ast);
  return diagnostics;
}

function collectBindingNames(ast: ExpressionNode): readonly string[] {
  const names = new Set<string>();
  const visit = (node: ExpressionNode): void => {
    switch (node.kind) {
      case "number":
        return;
      case "variable":
        if (node.name !== "pi" && node.name !== "e") names.add(node.name);
        return;
      case "unary":
        visit(node.operand);
        return;
      case "binary":
        visit(node.left);
        visit(node.right);
        return;
      case "function-call":
        node.arguments.forEach(visit);
    }
  };
  visit(ast);
  return [...names].sort();
}

export function compilePlotExpression(
  source: string,
  options: CompilePlotExpressionOptions,
): CompilePlotExpressionResult {
  if (source.trim().length === 0) {
    return {
      diagnostics: [
        expressionDiagnostic(
          "expression.empty",
          "Введите математическое выражение.",
          0,
          source.length,
        ),
      ],
      ok: false,
    };
  }
  if (source.length > maximumExpressionLength) {
    return {
      diagnostics: [
        expressionDiagnostic(
          "expression.expression-too-long",
          `Длина выражения превышает ${maximumExpressionLength} символов.`,
          maximumExpressionLength,
          source.length,
        ),
      ],
      ok: false,
    };
  }

  const parameterDiagnostics = validateParameterNames(options.parameterNames);
  if (parameterDiagnostics.length > 0) {
    return { diagnostics: parameterDiagnostics, ok: false };
  }

  const tokenized = tokenizePlotExpression(source);
  if (!tokenized.ok) return tokenized;
  const parsed = parsePlotExpression(tokenized.tokens);
  if (!parsed.ok) return parsed;

  const parameterNames = new Set(options.parameterNames);
  const diagnostics = validateAst(parsed.ast, options, parameterNames);
  if (diagnostics.length > 0) return { diagnostics, ok: false };

  return {
    expression: createCompiledPlotExpression({
      ast: parsed.ast,
      bindingNames: collectBindingNames(parsed.ast),
      context: options.context,
      normalizedSource: tokenized.normalized.source,
      source,
    }),
    ok: true,
  };
}
