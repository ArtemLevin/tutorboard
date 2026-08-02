import {
  handwrittenFunctionInterpretationLimits,
  type HandwrittenFunctionInterpretationDiagnosticCode,
} from "./interpretation-types";
import type {
  MathInkRecognitionCandidate,
  MathInkRecognitionFormat,
} from "./types";

export interface HandwrittenFunctionConversionDiagnostic {
  readonly code: HandwrittenFunctionInterpretationDiagnosticCode;
  readonly end?: number;
  readonly message: string;
  readonly start?: number;
}

export type HandwrittenFunctionConversionResult =
  | {
      readonly expression: string;
      readonly ok: true;
      readonly resolvedFormat: Exclude<MathInkRecognitionFormat, "jiix">;
    }
  | {
      readonly diagnostic: HandwrittenFunctionConversionDiagnostic;
      readonly ok: false;
    };

class ConversionFailure extends Error {
  public constructor(
    readonly diagnostic: HandwrittenFunctionConversionDiagnostic,
  ) {
    super(diagnostic.message);
  }
}

function failure(
  code: HandwrittenFunctionInterpretationDiagnosticCode,
  message: string,
  start?: number,
  end?: number,
): ConversionFailure {
  return new ConversionFailure({
    code,
    message,
    ...(start === undefined ? {} : { start }),
    ...(end === undefined ? {} : { end }),
  });
}

const superscriptCharacters: Readonly<Record<string, string>> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
};

function convertSuperscripts(source: string): string {
  let converted = "";
  let index = 0;
  while (index < source.length) {
    const mapped = superscriptCharacters[source[index]!];
    if (mapped === undefined) {
      converted += source[index]!;
      index += 1;
      continue;
    }
    let exponent = "";
    while (index < source.length) {
      const next = superscriptCharacters[source[index]!];
      if (next === undefined) break;
      exponent += next;
      index += 1;
    }
    converted += `^(${exponent})`;
  }
  return converted;
}

function replaceAbsoluteBars(source: string): string {
  let converted = "";
  let open = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character !== "|") {
      converted += character;
      continue;
    }
    converted += open ? ")" : "abs(";
    open = !open;
  }
  if (open) {
    throw failure(
      "handwriting.interpretation.latex-malformed",
      "Модуль содержит непарную вертикальную черту.",
    );
  }
  return converted;
}

function compactLeftSide(source: string): string {
  return source.replace(/\s+/gu, "").toLowerCase();
}

function removeFunctionWrapper(source: string): string {
  if (/[<>≤≥≠]/u.test(source)) {
    throw failure(
      "handwriting.interpretation.unsupported-relation",
      "Поддерживается одна явная функция без сравнений и неравенств.",
    );
  }

  let depth = 0;
  const equalIndexes: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "=" && depth === 0) equalIndexes.push(index);
  }

  if (equalIndexes.length === 0) return source.trim();
  if (equalIndexes.length !== 1) {
    throw failure(
      "handwriting.interpretation.unsupported-relation",
      "Поддерживается ровно одна явная функция.",
    );
  }

  const equalIndex = equalIndexes[0]!;
  const left = compactLeftSide(source.slice(0, equalIndex));
  if (left !== "y" && left !== "f(x)") {
    throw failure(
      "handwriting.interpretation.unsupported-relation",
      "Левая часть должна иметь вид y или f(x).",
      0,
      equalIndex,
    );
  }
  const right = source.slice(equalIndex + 1).trim();
  if (right.length === 0) {
    throw failure(
      "handwriting.interpretation.empty-source",
      "Правая часть функции пуста.",
      equalIndex + 1,
      source.length,
    );
  }
  return right;
}

function finishExpression(source: string): string {
  const replaced = convertSuperscripts(source)
    .replace(/[\[\]]/gu, (character) => (character === "[" ? "(" : ")"))
    .replace(/\u00a0/gu, " ")
    .replace(/\u2212|\u2013|\u2014/gu, "-")
    .replace(/\u00d7|\u00b7|\u22c5/gu, "*")
    .replace(/\u00f7/gu, "/")
    .replace(/π/gu, "pi");
  const unwrapped = removeFunctionWrapper(replaceAbsoluteBars(replaced));
  if (unwrapped.trim().length === 0) {
    throw failure(
      "handwriting.interpretation.empty-source",
      "Распознанное выражение пусто.",
    );
  }
  return unwrapped;
}

const latexFunctionCommands: Readonly<Record<string, string>> = {
  abs: "abs",
  acos: "acos",
  arcsin: "asin",
  arccos: "acos",
  arctan: "atan",
  asin: "asin",
  atan: "atan",
  ceil: "ceil",
  cos: "cos",
  exp: "exp",
  floor: "floor",
  ln: "ln",
  log: "log",
  max: "max",
  min: "min",
  sin: "sin",
  tan: "tan",
};

class LatexReader {
  private index = 0;

  public constructor(private readonly source: string) {}

  public read(): string {
    const expression = this.readSequence(null, 0);
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      throw failure(
        "handwriting.interpretation.latex-malformed",
        "После LaTeX-выражения обнаружен лишний фрагмент.",
        this.index,
        this.source.length,
      );
    }
    return expression;
  }

  private checkDepth(depth: number): void {
    if (
      depth > handwrittenFunctionInterpretationLimits.maximumConversionDepth
    ) {
      throw failure(
        "handwriting.interpretation.latex-depth-limit",
        `Глубина LaTeX превышает ${handwrittenFunctionInterpretationLimits.maximumConversionDepth} уровней.`,
      );
    }
  }

  private skipWhitespace(): void {
    while (/\s/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private readSequence(stop: string | null, depth: number): string {
    this.checkDepth(depth);
    let output = "";
    while (this.index < this.source.length) {
      const character = this.source[this.index]!;
      if (stop !== null && character === stop) {
        this.index += 1;
        return output;
      }
      if (character === "}") {
        throw failure(
          "handwriting.interpretation.latex-malformed",
          "Обнаружена лишняя закрывающая фигурная скобка.",
          this.index,
          this.index + 1,
        );
      }
      if (character === "{") {
        this.index += 1;
        output += `(${this.readSequence("}", depth + 1)})`;
        continue;
      }
      if (character === "\\") {
        output += this.readCommand(depth + 1);
        continue;
      }
      if (character === "^") {
        this.index += 1;
        output += `^(${this.readAtom(depth + 1)})`;
        continue;
      }
      if (character === "_") {
        throw failure(
          "handwriting.interpretation.latex-subscript",
          "Нижние индексы пока не поддерживаются в явной функции.",
          this.index,
          this.index + 1,
        );
      }
      if (character === "$" || character === "\u00a0") {
        this.index += 1;
        continue;
      }
      output += character;
      this.index += 1;
    }
    if (stop !== null) {
      throw failure(
        "handwriting.interpretation.latex-malformed",
        "Пропущена закрывающая фигурная скобка.",
        this.source.length,
        this.source.length,
      );
    }
    return output;
  }

  private readAtom(depth: number): string {
    this.checkDepth(depth);
    this.skipWhitespace();
    const start = this.index;
    const character = this.source[this.index];
    if (character === undefined) {
      throw failure(
        "handwriting.interpretation.latex-malformed",
        "После степени отсутствует показатель.",
        start,
        start,
      );
    }
    if (character === "{") {
      this.index += 1;
      return this.readSequence("}", depth + 1);
    }
    if (character === "\\") return this.readCommand(depth + 1);
    if (character === "+" || character === "-") {
      this.index += 1;
      const next = this.readAtom(depth + 1);
      return `${character}${next}`;
    }
    if (/[A-Za-z0-9.]/u.test(character)) {
      this.index += 1;
      return character;
    }
    throw failure(
      "handwriting.interpretation.latex-malformed",
      "Недопустимый показатель степени.",
      start,
      start + 1,
    );
  }

  private readRequiredGroup(depth: number, command: string): string {
    this.checkDepth(depth);
    this.skipWhitespace();
    if (this.source[this.index] !== "{") {
      throw failure(
        "handwriting.interpretation.latex-malformed",
        `Команда \\${command} ожидает аргумент в фигурных скобках.`,
        this.index,
        Math.min(this.index + 1, this.source.length),
      );
    }
    this.index += 1;
    return this.readSequence("}", depth + 1);
  }

  private readCommand(depth: number): string {
    this.checkDepth(depth);
    const commandStart = this.index;
    this.index += 1;
    if (this.index >= this.source.length) {
      throw failure(
        "handwriting.interpretation.latex-malformed",
        "LaTeX-команда не завершена.",
        commandStart,
        this.source.length,
      );
    }

    const first = this.source[this.index]!;
    if (!/[A-Za-z]/u.test(first)) {
      this.index += 1;
      const delimiter = {
        "(": "(",
        ")": ")",
        "[": "(",
        "]": ")",
        "{": "(",
        "}": ")",
        "|": "|",
      }[first];
      if (delimiter !== undefined) return delimiter;
      if (first === "," || first === ";" || first === " ") return "";
      throw failure(
        "handwriting.interpretation.latex-unsupported-command",
        `Команда \\${first} не поддерживается.`,
        commandStart,
        this.index,
      );
    }

    let command = "";
    while (/[A-Za-z]/u.test(this.source[this.index] ?? "")) {
      command += this.source[this.index]!;
      this.index += 1;
    }

    if (command === "frac") {
      const numerator = this.readRequiredGroup(depth + 1, command);
      const denominator = this.readRequiredGroup(depth + 1, command);
      return `((${numerator})/(${denominator}))`;
    }
    if (command === "sqrt") {
      this.skipWhitespace();
      if (this.source[this.index] === "[") {
        throw failure(
          "handwriting.interpretation.latex-unsupported-command",
          "Корни произвольной степени пока не поддерживаются.",
          commandStart,
          this.index + 1,
        );
      }
      return `sqrt(${this.readRequiredGroup(depth + 1, command)})`;
    }
    if (command === "pi") return "pi";
    if (command === "cdot" || command === "times") return "*";
    if (command === "div") return "/";
    if (command === "left" || command === "right") return "";
    if (command === "lvert" || command === "rvert") return "|";
    if (command === "quad" || command === "qquad") return " ";
    if (command === "displaystyle") return "";

    const functionName = latexFunctionCommands[command];
    if (functionName !== undefined) return functionName;

    if (
      command === "mathrm" ||
      command === "mathbf" ||
      command === "mathit" ||
      command === "text"
    ) {
      return this.readRequiredGroup(depth + 1, command);
    }
    if (command === "operatorname") {
      const name = this.readRequiredGroup(depth + 1, command).replace(
        /\s+/gu,
        "",
      );
      const mapped = latexFunctionCommands[name];
      if (mapped !== undefined) return mapped;
    }

    throw failure(
      "handwriting.interpretation.latex-unsupported-command",
      `Команда \\${command} не поддерживается.`,
      commandStart,
      this.index,
    );
  }
}

function convertLatex(source: string): string {
  const trimmed = source
    .trim()
    .replace(/^\\\(|\\\)$/gu, "")
    .replace(/^\\\[|\\\]$/gu, "");
  return finishExpression(new LatexReader(trimmed).read());
}

function convertPlotExpression(source: string): string {
  if (source.includes("\\")) {
    throw failure(
      "handwriting.interpretation.latex-unsupported-command",
      "Кандидат plot-expression содержит LaTeX-команду.",
    );
  }
  return finishExpression(source);
}

const jiixPreferredKeys = [
  "latex",
  "expression",
  "label",
  "value",
  "text",
] as const;

interface JiixStringCandidate {
  readonly key: string;
  readonly value: string;
}

function extractJiixStrings(root: unknown): readonly JiixStringCandidate[] {
  const strings: JiixStringCandidate[] = [];
  let nodes = 0;

  const visit = (value: unknown, depth: number, key: string): void => {
    nodes += 1;
    if (nodes > handwrittenFunctionInterpretationLimits.maximumJiixNodes) {
      throw failure(
        "handwriting.interpretation.jiix-node-limit",
        `JIIX содержит больше ${handwrittenFunctionInterpretationLimits.maximumJiixNodes} узлов.`,
      );
    }
    if (depth > handwrittenFunctionInterpretationLimits.maximumJiixDepth) {
      throw failure(
        "handwriting.interpretation.jiix-depth-limit",
        `Глубина JIIX превышает ${handwrittenFunctionInterpretationLimits.maximumJiixDepth} уровней.`,
      );
    }
    if (typeof value === "string") {
      if (
        jiixPreferredKeys.includes(key as (typeof jiixPreferredKeys)[number])
      ) {
        strings.push({ key, value });
        if (
          strings.length >
          handwrittenFunctionInterpretationLimits.maximumJiixStrings
        ) {
          throw failure(
            "handwriting.interpretation.jiix-string-limit",
            `JIIX содержит больше ${handwrittenFunctionInterpretationLimits.maximumJiixStrings} текстовых кандидатов.`,
          );
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1, key));
      return;
    }
    if (typeof value !== "object" || value === null) return;

    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record);
    const preferred = jiixPreferredKeys.filter((item) => keys.includes(item));
    const remaining = keys
      .filter(
        (item) =>
          !jiixPreferredKeys.includes(
            item as (typeof jiixPreferredKeys)[number],
          ),
      )
      .sort();
    for (const childKey of [...preferred, ...remaining]) {
      visit(record[childKey], depth + 1, childKey);
    }
  };

  visit(root, 0, "root");
  return strings;
}

function convertJiix(source: string): {
  readonly expression: string;
  readonly resolvedFormat: "latex" | "plot-expression";
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw failure(
      "handwriting.interpretation.jiix-parse",
      "JIIX не является корректным JSON.",
    );
  }

  const extracted = extractJiixStrings(parsed)
    .filter(({ value }) => value.trim().length > 0)
    .sort((left, right) => {
      const leftPriority = jiixPreferredKeys.indexOf(
        left.key as (typeof jiixPreferredKeys)[number],
      );
      const rightPriority = jiixPreferredKeys.indexOf(
        right.key as (typeof jiixPreferredKeys)[number],
      );
      return leftPriority - rightPriority;
    });
  const selected = extracted[0];
  if (selected === undefined) {
    throw failure(
      "handwriting.interpretation.jiix-unsupported",
      "JIIX не содержит поддерживаемого математического текста.",
    );
  }

  const looksLikeLatex =
    selected.key === "latex" || /\\[A-Za-z]+|[{}]/u.test(selected.value);
  return looksLikeLatex
    ? { expression: convertLatex(selected.value), resolvedFormat: "latex" }
    : {
        expression: convertPlotExpression(selected.value),
        resolvedFormat: "plot-expression",
      };
}

export function convertHandwrittenFunctionCandidate(
  candidate: MathInkRecognitionCandidate,
): HandwrittenFunctionConversionResult {
  if (
    candidate.expression.length >
    handwrittenFunctionInterpretationLimits.maximumCandidateSourceLength
  ) {
    return {
      diagnostic: {
        code: "handwriting.interpretation.source-too-long",
        message: `Длина кандидата превышает ${handwrittenFunctionInterpretationLimits.maximumCandidateSourceLength} символов.`,
      },
      ok: false,
    };
  }
  if (candidate.expression.trim().length === 0) {
    return {
      diagnostic: {
        code: "handwriting.interpretation.empty-source",
        message: "Распознаватель вернул пустой кандидат.",
      },
      ok: false,
    };
  }

  try {
    if (candidate.format === "latex") {
      return {
        expression: convertLatex(candidate.expression),
        ok: true,
        resolvedFormat: "latex",
      };
    }
    if (candidate.format === "plot-expression") {
      return {
        expression: convertPlotExpression(candidate.expression),
        ok: true,
        resolvedFormat: "plot-expression",
      };
    }
    const converted = convertJiix(candidate.expression);
    return { ...converted, ok: true };
  } catch (error) {
    if (error instanceof ConversionFailure) {
      return { diagnostic: error.diagnostic, ok: false };
    }
    throw error;
  }
}
