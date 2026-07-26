export interface SafeMathLabel {
  readonly accessibleText: string;
  readonly displayText: string;
  readonly math: boolean;
}

const commands: Readonly<Record<string, string>> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  phi: "φ",
  omega: "ω",
  times: "×",
  cdot: "·",
  pm: "±",
  neq: "≠",
  leq: "≤",
  geq: "≥",
  infty: "∞",
  sqrt: "√",
};

const superscript: Readonly<Record<string, string>> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  n: "ⁿ",
};

const subscript: Readonly<Record<string, string>> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
};

function unwrapMath(value: string): {
  readonly math: boolean;
  readonly text: string;
} {
  const trimmed = value.trim();
  if (trimmed.startsWith("$") && trimmed.endsWith("$") && trimmed.length >= 2) {
    return { math: true, text: trimmed.slice(1, -1) };
  }
  if (
    trimmed.startsWith("\\(") &&
    trimmed.endsWith("\\)") &&
    trimmed.length >= 4
  ) {
    return { math: true, text: trimmed.slice(2, -2) };
  }
  return { math: false, text: value };
}

function scriptValue(
  value: string,
  alphabet: Readonly<Record<string, string>>,
): string {
  return [...value]
    .map((character) => alphabet[character] ?? character)
    .join("");
}

function replaceUnsafeControls(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      const safeWhitespace = code === 9 || code === 10 || code === 13;
      return (!safeWhitespace && code < 32) || code === 127 ? "�" : character;
    })
    .join("");
}

export function renderSafeMathLabel(value: string): SafeMathLabel {
  const normalized = replaceUnsafeControls(value.normalize("NFC"));
  const unwrapped = unwrapMath(normalized);
  if (!unwrapped.math) {
    return {
      accessibleText: unwrapped.text,
      displayText: unwrapped.text.replaceAll("<", "‹").replaceAll(">", "›"),
      math: false,
    };
  }

  const accessibleText = unwrapped.text
    .replace(/\\([A-Za-z]+)/gu, "$1")
    .replace(/[{}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const displayText = unwrapped.text
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/gu, "$1⁄$2")
    .replace(
      /\\([A-Za-z]+)/gu,
      (match, command: string) => commands[command] ?? match.slice(1),
    )
    .replace(/\^\{([^{}]+)\}|\^([0-9n+-])/gu, (_match, group, single) =>
      scriptValue((group ?? single) as string, superscript),
    )
    .replace(/_\{([^{}]+)\}|_([0-9+-])/gu, (_match, group, single) =>
      scriptValue((group ?? single) as string, subscript),
    )
    .replace(/[{}]/gu, "")
    .replaceAll("<", "‹")
    .replaceAll(">", "›");

  return { accessibleText, displayText, math: true };
}
