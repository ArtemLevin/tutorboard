import type { ExactValue } from "./types";

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}

export function normalizeExactValue(value: ExactValue): ExactValue {
  if (value.kind === "decimal") return value;
  if (value.kind === "rational") {
    const divisor = gcd(value.numerator, value.denominator);
    const sign = value.denominator < 0 ? -1 : 1;
    return {
      denominator: Math.abs(value.denominator / divisor),
      kind: "rational",
      numerator: (value.numerator / divisor) * sign,
    };
  }
  const divisor = gcd(value.coefficientNumerator, value.coefficientDenominator);
  return {
    coefficientDenominator: Math.abs(value.coefficientDenominator / divisor),
    coefficientNumerator:
      (value.coefficientNumerator / divisor) *
      (value.coefficientDenominator < 0 ? -1 : 1),
    kind: "radical",
    radicand: value.radicand,
  };
}

export function parseExactValue(raw: string): ExactValue | null {
  const value = raw.trim().toLowerCase().replaceAll(" ", "").replace(",", ".");
  const fraction = /^(-?\d+)\/(\d+)$/u.exec(value);
  if (fraction !== null && Number(fraction[2]) !== 0)
    return normalizeExactValue({
      denominator: Number(fraction[2]),
      kind: "rational",
      numerator: Number(fraction[1]),
    });
  const radical =
    /^(-?(?:\d+)?)(?:\*?)(?:sqrt\((\d+)\)|√(\d+))(?:\/(\d+))?$/u.exec(value);
  if (radical !== null) {
    const coefficient =
      radical[1] === "" || radical[1] === "-" ? `${radical[1]}1` : radical[1]!;
    return normalizeExactValue({
      coefficientDenominator: Number(radical[4] ?? 1),
      coefficientNumerator: Number(coefficient),
      kind: "radical",
      radicand: Number(radical[2] ?? radical[3]),
    });
  }
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value)) {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? { kind: "decimal", value: numeric }
      : null;
  }
  return null;
}

export function exactValueToNumber(value: ExactValue): number {
  if (value.kind === "decimal") return value.value;
  if (value.kind === "rational") return value.numerator / value.denominator;
  return (
    (value.coefficientNumerator / value.coefficientDenominator) *
    Math.sqrt(value.radicand)
  );
}

export function exactValuesEqual(
  left: ExactValue,
  right: ExactValue,
  tolerance = 1e-8,
): boolean {
  const a = normalizeExactValue(left);
  const b = normalizeExactValue(right);
  if (a.kind === "rational" && b.kind === "rational")
    return a.numerator === b.numerator && a.denominator === b.denominator;
  if (a.kind === "radical" && b.kind === "radical")
    return (
      a.coefficientNumerator === b.coefficientNumerator &&
      a.coefficientDenominator === b.coefficientDenominator &&
      a.radicand === b.radicand
    );
  return Math.abs(exactValueToNumber(a) - exactValueToNumber(b)) <= tolerance;
}
