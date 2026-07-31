import { expressionDiagnostic } from "./diagnostics";
import { maximumExpressionTokens } from "./limits";
import {
  normalizePlotExpression,
  originalExpressionSpan,
  type NormalizedPlotExpression,
} from "./normalization";
import type { ExpressionDiagnostic } from "./types";

export const expressionTokenKinds = [
  "number",
  "identifier",
  "plus",
  "minus",
  "star",
  "slash",
  "power",
  "left-parenthesis",
  "right-parenthesis",
  "comma",
  "end",
] as const;

export type ExpressionTokenKind = (typeof expressionTokenKinds)[number];

export interface ExpressionToken {
  readonly end: number;
  readonly kind: ExpressionTokenKind;
  readonly lexeme: string;
  readonly start: number;
  readonly value?: number;
}

export type TokenizePlotExpressionResult =
  | {
      readonly normalized: NormalizedPlotExpression;
      readonly ok: true;
      readonly tokens: readonly ExpressionToken[];
    }
  | {
      readonly diagnostics: readonly ExpressionDiagnostic[];
      readonly normalized: NormalizedPlotExpression;
      readonly ok: false;
    };

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function isIdentifierStart(character: string | undefined): boolean {
  return (
    character !== undefined &&
    ((character >= "A" && character <= "Z") ||
      (character >= "a" && character <= "z") ||
      character === "_")
  );
}

function isIdentifierPart(character: string | undefined): boolean {
  return isIdentifierStart(character) || isDigit(character);
}

function token(
  normalized: NormalizedPlotExpression,
  kind: ExpressionTokenKind,
  normalizedStart: number,
  normalizedEnd: number,
  value?: number,
): ExpressionToken {
  const span = originalExpressionSpan(
    normalized,
    normalizedStart,
    normalizedEnd,
  );
  return {
    end: span.end,
    kind,
    lexeme: normalized.source.slice(normalizedStart, normalizedEnd),
    start: span.start,
    ...(value === undefined ? {} : { value }),
  };
}

function numberEnd(source: string, start: number): number {
  let index = start;
  let sawDigits = false;

  while (isDigit(source[index])) {
    sawDigits = true;
    index += 1;
  }
  if (source[index] === ".") {
    index += 1;
    while (isDigit(source[index])) {
      sawDigits = true;
      index += 1;
    }
  }
  if (!sawDigits) return start;

  const exponentStart = index;
  if (source[index] === "e" || source[index] === "E") {
    index += 1;
    if (source[index] === "+" || source[index] === "-") index += 1;
    const exponentDigitsStart = index;
    while (isDigit(source[index])) index += 1;
    if (index === exponentDigitsStart) return exponentStart;
  }
  return index;
}

export function tokenizePlotExpression(
  source: string,
): TokenizePlotExpressionResult {
  const normalized = normalizePlotExpression(source);
  const tokens: ExpressionToken[] = [];
  let index = 0;

  while (index < normalized.source.length) {
    const character = normalized.source[index]!;
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }

    const numericEnd =
      isDigit(character) ||
      (character === "." && isDigit(normalized.source[index + 1]))
        ? numberEnd(normalized.source, index)
        : index;
    if (numericEnd > index) {
      const lexeme = normalized.source.slice(index, numericEnd);
      const value = Number(lexeme);
      if (!Number.isFinite(value)) {
        const span = originalExpressionSpan(normalized, index, numericEnd);
        return {
          diagnostics: [
            expressionDiagnostic(
              "expression.invalid-number",
              `Число ${lexeme} выходит за допустимый диапазон.`,
              span.start,
              span.end,
            ),
          ],
          normalized,
          ok: false,
        };
      }
      tokens.push(token(normalized, "number", index, numericEnd, value));
      index = numericEnd;
    } else if (isIdentifierStart(character)) {
      let end = index + 1;
      while (isIdentifierPart(normalized.source[end])) end += 1;
      tokens.push(token(normalized, "identifier", index, end));
      index = end;
    } else {
      const kind: ExpressionTokenKind | undefined = {
        "+": "plus",
        "-": "minus",
        "*": "star",
        "/": "slash",
        "^": "power",
        "(": "left-parenthesis",
        ")": "right-parenthesis",
        ",": "comma",
      }[character] as ExpressionTokenKind | undefined;
      if (kind === undefined) {
        const span = originalExpressionSpan(normalized, index, index + 1);
        return {
          diagnostics: [
            expressionDiagnostic(
              "expression.unexpected-character",
              `Неожиданный символ «${source.slice(span.start, span.end)}».`,
              span.start,
              span.end,
            ),
          ],
          normalized,
          ok: false,
        };
      }
      tokens.push(token(normalized, kind, index, index + 1));
      index += 1;
    }

    if (tokens.length > maximumExpressionTokens) {
      const last = tokens.at(-1)!;
      return {
        diagnostics: [
          expressionDiagnostic(
            "expression.too-many-tokens",
            `Выражение содержит больше ${maximumExpressionTokens} токенов.`,
            last.start,
            last.end,
          ),
        ],
        normalized,
        ok: false,
      };
    }
  }

  tokens.push({
    end: source.length,
    kind: "end",
    lexeme: "",
    start: source.length,
  });
  return { normalized, ok: true, tokens };
}
