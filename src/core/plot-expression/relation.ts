export const plotRelationOperators = ["=", "<", "<=", ">", ">="] as const;

export type PlotRelationOperator = (typeof plotRelationOperators)[number];

export type ParsePlotRelationResult =
  | {
      readonly leftSource: string;
      readonly leftStart: number;
      readonly ok: true;
      readonly operator: PlotRelationOperator;
      readonly operatorEnd: number;
      readonly operatorStart: number;
      readonly rightSource: string;
      readonly rightStart: number;
    }
  | {
      readonly end: number;
      readonly message: string;
      readonly ok: false;
      readonly start: number;
    };

function normalizedOperator(value: string): PlotRelationOperator | null {
  if (value === "≤") return "<=";
  if (value === "≥") return ">=";
  return plotRelationOperators.includes(value as PlotRelationOperator)
    ? (value as PlotRelationOperator)
    : null;
}

function trimmedPart(source: string, start: number, end: number) {
  const raw = source.slice(start, end);
  const leading = raw.length - raw.trimStart().length;
  return { source: raw.trim(), start: start + leading };
}

export function parsePlotRelation(source: string): ParsePlotRelationResult {
  let depth = 0;
  let match:
    | {
        readonly end: number;
        readonly operator: PlotRelationOperator;
        readonly start: number;
      }
    | undefined;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0 || !"=<>≤≥".includes(character)) continue;

    const candidate =
      (character === "<" || character === ">") && source[index + 1] === "="
        ? `${character}=`
        : character;
    const operator = normalizedOperator(candidate);
    if (operator === null) continue;
    const current = {
      end: index + candidate.length,
      operator,
      start: index,
    } as const;
    if (match !== undefined) {
      return {
        end: current.end,
        message: "Используйте один знак равенства или неравенства.",
        ok: false,
        start: match.start,
      };
    }
    match = current;
    index += candidate.length - 1;
  }

  if (match === undefined) {
    return {
      end: source.length,
      message: "Добавьте знак =, <, ≤, > или ≥.",
      ok: false,
      start: 0,
    };
  }

  const left = trimmedPart(source, 0, match.start);
  const right = trimmedPart(source, match.end, source.length);
  if (left.source.length === 0 || right.source.length === 0) {
    return {
      end: source.length,
      message: "Заполните обе части математического выражения.",
      ok: false,
      start: 0,
    };
  }

  return {
    leftSource: left.source,
    leftStart: left.start,
    ok: true,
    operator: match.operator,
    operatorEnd: match.end,
    operatorStart: match.start,
    rightSource: right.source,
    rightStart: right.start,
  };
}

export function plotRelationIsInequality(
  operator: PlotRelationOperator,
): boolean {
  return operator !== "=";
}
