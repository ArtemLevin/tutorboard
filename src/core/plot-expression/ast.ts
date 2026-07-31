export interface ExpressionSpan {
  readonly end: number;
  readonly start: number;
}

export interface NumberNode extends ExpressionSpan {
  readonly kind: "number";
  readonly value: number;
}

export interface VariableNode extends ExpressionSpan {
  readonly kind: "variable";
  readonly name: string;
}

export interface UnaryNode extends ExpressionSpan {
  readonly kind: "unary";
  readonly operand: ExpressionNode;
  readonly operator: "+" | "-";
}

export interface BinaryNode extends ExpressionSpan {
  readonly kind: "binary";
  readonly left: ExpressionNode;
  readonly operator: "+" | "-" | "*" | "/" | "^";
  readonly right: ExpressionNode;
}

export interface FunctionCallNode extends ExpressionSpan {
  readonly arguments: readonly ExpressionNode[];
  readonly kind: "function-call";
  readonly name: string;
}

export type ExpressionNode =
  BinaryNode | FunctionCallNode | NumberNode | UnaryNode | VariableNode;
