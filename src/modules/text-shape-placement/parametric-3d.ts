import {
  normalizeTextShapeQuery,
  resolveTextShape as resolveCatalogTextShape,
  suggestTextShapes as suggestCatalogTextShapes,
  type TextShapeDefinition,
} from "./catalog";

const adjectiveSides: Readonly<Record<string, number>> = {
  "треугольн": 3,
  "четырехугольн": 4,
  "пятиугольн": 5,
  "шестиугольн": 6,
  "семиугольн": 7,
  "восьмиугольн": 8,
  "девятиугольн": 9,
  "десятиугольн": 10,
  "одиннадцатиугольн": 11,
  "двенадцатиугольн": 12,
};

function sidesFromQuery(normalized: string): number | null {
  const numeric = normalized.match(/(?:^|\s)(\d{1,2})(?:\s|$| угольн)/u)?.[1];
  if (numeric !== undefined) {
    const sides = Number(numeric);
    return sides >= 3 && sides <= 32 ? sides : null;
  }
  for (const [stem, sides] of Object.entries(adjectiveSides)) {
    if (normalized.includes(stem)) return sides;
  }
  return null;
}

const solidDefinition = (
  id: string,
  label: string,
  aliases: readonly string[],
  template: TextShapeDefinition["template"],
): TextShapeDefinition => ({
  aliases,
  canonicalPrompt: `Построй ${label.toLocaleLowerCase("ru")}`,
  category: "3d",
  id,
  label,
  template,
});

function parametricSolid(query: string): TextShapeDefinition | undefined {
  const normalized = normalizeTextShapeQuery(query);
  if (normalized === "додекаэдр" || normalized.includes("додекаэдр"))
    return solidDefinition(
      "dodecahedron",
      "Додекаэдр",
      ["додекаэдр", "правильный додекаэдр"],
      { kind: "solid", variant: "octahedron" },
    );
  if (normalized === "икосаэдр" || normalized.includes("икосаэдр"))
    return solidDefinition(
      "icosahedron",
      "Икосаэдр",
      ["икосаэдр", "правильный икосаэдр"],
      { kind: "solid", variant: "octahedron" },
    );

  const sides = sidesFromQuery(normalized);
  if (sides === null) return undefined;
  if (normalized.includes("усеч") && normalized.includes("пирамид"))
    return solidDefinition(
      `truncated-pyramid-${String(sides)}`,
      `Усечённая ${String(sides)}-угольная пирамида`,
      [`усеченная пирамида ${String(sides)}`, `усечённая пирамида ${String(sides)}`],
      { kind: "pyramid", sides },
    );
  if (normalized.includes("призм"))
    return solidDefinition(
      `prism-${String(sides)}`,
      `${String(sides)}-угольная призма`,
      [`призма ${String(sides)}`, `призма с ${String(sides)} угольным основанием`],
      { kind: "prism", sides },
    );
  if (normalized.includes("пирамид"))
    return solidDefinition(
      `pyramid-${String(sides)}`,
      `${String(sides)}-угольная пирамида`,
      [`пирамида ${String(sides)}`, `пирамида с ${String(sides)} угольным основанием`],
      { kind: "pyramid", sides },
    );
  return undefined;
}

export function resolveTextShape(
  query: string,
): TextShapeDefinition | undefined {
  return parametricSolid(query) ?? resolveCatalogTextShape(query);
}

export function suggestTextShapes(
  query: string,
  limit = 8,
): readonly TextShapeDefinition[] {
  const parametric = parametricSolid(query);
  return parametric === undefined
    ? suggestCatalogTextShapes(query, limit)
    : [parametric];
}
