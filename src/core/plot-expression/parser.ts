import type {
  BinaryNode,
  ExpressionNode,
  FunctionCallNode,
  UnaryNode,
} from "./ast";
import { expressionDiagnostic } from "./diagnostics";
import { isPlotFunctionName } from "./functions";
import {
  maximumExpressionAstDepth,
  maximumExpressionAstNodes,
  maximumFunctionArguments,
} from "./limits";
import type { ExpressionDiagnostic } from "./types";
import type { ExpressionToken, ExpressionTokenKind } from "./tokenizer";

export type ParsePlotExpressionResult =
  | {
      readonly ast: ExpressionNode;
      readonly ok: true;
    }
  | {
      readonly diagnostics: readonly ExpressionDiagnostic[];
      readonly ok: false;
    };

class ParseFailure extends Error {
  constructor(readonly diagnostic: ExpressionDiagnostic) {
    super(diagnostic.message);
  }
}

function startsPrimary(kind: ExpressionTokenKind): boolean {
  return (
    kind === "number" || kind === "identifier" || kind === "left-parenthesis"
  );
}

export function parsePlotExpression(
  tokens: readonly ExpressionToken[],
): ParsePlotExpressionResult {
  let position = 0;
  let nodeCount = 0;
  const nodeDepths = new WeakMap<ExpressionNode, number>();

  const current = (): ExpressionToken => tokens[position] ?? tokens.at(-1)!;
  const advance = (): ExpressionToken => {
    const result = current();
    position = Math.min(position + 1, tokens.length - 1);
    return result;
  };
  const fail = (
    code: ExpressionDiagnostic["code"],
    message: string,
    token: ExpressionToken = current(),
  ): never => {
    throw new ParseFailure(
      expressionDiagnostic(code, message, token.start, token.end),
    );
  };
  const nodeDepth = (node: ExpressionNode): number => {
    switch (node.kind) {
      case "number":
      case "variable":
        return 1;
      case "unary":
        return 1 + (nodeDepths.get(node.operand) ?? 1);
      case "binary":
        return (
          1 +
          Math.max(
            nodeDepths.get(node.left) ?? 1,
            nodeDepths.get(node.right) ?? 1,
          )
        );
      case "function-call":
        return (
          1 +
          node.arguments.reduce(
            (maximum, argument) =>
              Math.max(maximum, nodeDepths.get(argument) ?? 1),
            0,
          )
        );
    }
  };
  const countNode = <Node extends ExpressionNode>(node: Node): Node => {
    nodeCount += 1;
    if (nodeCount > maximumExpressionAstNodes) {
      fail(
        "expression.too-many-nodes",
        `Выражение содержит больше ${maximumExpressionAstNodes} узлов.`,
        { ...current(), start: node.start, end: node.end },
      );
    }
    const depth = nodeDepth(node);
    nodeDepths.set(node, depth);
    if (depth > maximumExpressionAstDepth) {
      fail(
        "expression.ast-too-deep",
        `Глубина выражения превышает ${maximumExpressionAstDepth} уровней.`,
        { ...current(), start: node.start, end: node.end },
      );
    }
    return node;
  };

  const parseExpression = (
    minimumBindingPower: number,
    depth: number,
  ): ExpressionNode => {
    if (depth > maximumExpressionAstDepth) {
      fail(
        "expression.ast-too-deep",
        `Глубина выражения превышает ${maximumExpressionAstDepth} уровней.`,
      );
    }
    const first = advance();
    let left!: ExpressionNode;

    if (first.kind === "number") {
      left = countNode({
        end: first.end,
        kind: "number",
        start: first.start,
        value: first.value!,
      });
    } else if (first.kind === "identifier") {
      if (
        current().kind === "left-parenthesis" &&
        isPlotFunctionName(first.lexeme)
      ) {
        advance();
        const argumentsList: ExpressionNode[] = [];
        if (current().kind !== "right-parenthesis") {
          while (true) {
            argumentsList.push(parseExpression(0, depth + 1));
            if (argumentsList.length > maximumFunctionArguments) {
              fail(
                "expression.invalid-function-arity",
                `Функция ${first.lexeme} принимает не больше ${maximumFunctionArguments} аргументов.`,
                first,
              );
            }
            if (current().kind !== "comma") break;
            advance();
          }
        }
        if (current().kind !== "right-parenthesis") {
          fail(
            "expression.expected-closing-parenthesis",
            "Пропущена закрывающая скобка.",
          );
        }
        const closing = advance();
        const call: FunctionCallNode = {
          arguments: argumentsList,
          end: closing.end,
          kind: "function-call",
          name: first.lexeme,
          start: first.start,
        };
        left = countNode(call);
      } else {
        left = countNode({
          end: first.end,
          kind: "variable",
          name: first.lexeme,
          start: first.start,
        });
      }
    } else if (first.kind === "plus" || first.kind === "minus") {
      const operand = parseExpression(25, depth + 1);
      const unary: UnaryNode = {
        end: operand.end,
        kind: "unary",
        operand,
        operator: first.kind === "plus" ? "+" : "-",
        start: first.start,
      };
      left = countNode(unary);
    } else if (first.kind === "left-parenthesis") {
      const grouped = parseExpression(0, depth + 1);
      if (current().kind !== "right-parenthesis") {
        fail(
          "expression.expected-closing-parenthesis",
          "Пропущена закрывающая скобка.",
        );
      }
      const closing = advance();
      left = { ...grouped, end: closing.end, start: first.start };
      nodeDepths.set(left, nodeDepths.get(grouped) ?? nodeDepth(grouped));
    } else {
      fail(
        "expression.expected-expression",
        "Ожидалось число, переменная, функция или выражение в скобках.",
        first,
      );
    }

    while (true) {
      const next = current();
      let operator: BinaryNode["operator"];
      let leftBindingPower: number;
      let rightBindingPower: number;
      let explicitOperator = true;

      switch (next.kind) {
        case "plus":
          operator = "+";
          leftBindingPower = 10;
          rightBindingPower = 11;
          break;
        case "minus":
          operator = "-";
          leftBindingPower = 10;
          rightBindingPower = 11;
          break;
        case "star":
          operator = "*";
          leftBindingPower = 20;
          rightBindingPower = 21;
          break;
        case "slash":
          operator = "/";
          leftBindingPower = 20;
          rightBindingPower = 21;
          break;
        case "power":
          operator = "^";
          leftBindingPower = 30;
          rightBindingPower = 30;
          break;
        default:
          if (!startsPrimary(next.kind)) return left;
          operator = "*";
          leftBindingPower = 20;
          rightBindingPower = 21;
          explicitOperator = false;
      }

      if (leftBindingPower < minimumBindingPower) return left;
      if (explicitOperator) advance();
      const right = parseExpression(rightBindingPower, depth + 1);
      left = countNode({
        end: right.end,
        kind: "binary",
        left,
        operator,
        right,
        start: left.start,
      });
    }
  };

  try {
    const ast = parseExpression(0, 1);
    if (current().kind !== "end") {
      fail(
        "expression.unexpected-token",
        `Неожиданный фрагмент «${current().lexeme}».`,
      );
    }
    return { ast, ok: true };
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { diagnostics: [error.diagnostic], ok: false };
    }
    throw error;
  }
}
