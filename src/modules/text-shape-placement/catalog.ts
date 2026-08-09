export type TextShapeTemplate =
  | { readonly kind: "point" }
  | { readonly kind: "line"; readonly mode: "line" | "ray" | "segment" }
  | {
      readonly degrees?: number;
      readonly kind: "angle";
      readonly variant: "acute" | "obtuse" | "right" | "standard";
    }
  | {
      readonly kind: "triangle";
      readonly variant:
        | "acute"
        | "equilateral"
        | "isosceles"
        | "obtuse"
        | "right"
        | "scalene"
        | "standard"
        | "inscribed"
        | "circumscribed";
    }
  | {
      readonly kind: "quadrilateral";
      readonly variant:
        | "kite"
        | "parallelogram"
        | "rectangle"
        | "rhombus"
        | "right-trapezoid"
        | "square"
        | "trapezoid"
        | "isosceles-trapezoid"
        | "inscribed-trapezoid"
        | "circumscribed-trapezoid";
    }
  | { readonly kind: "regular-polygon"; readonly sides: number }
  | {
      readonly kind: "conic";
      readonly variant: "circle" | "ellipse" | "semicircle";
    }
  | {
      readonly kind: "solid";
      readonly variant:
        | "cone"
        | "cube"
        | "cuboid"
        | "cylinder"
        | "frustum"
        | "hemisphere"
        | "octahedron"
        | "dodecahedron"
        | "icosahedron"
        | "sphere";
    }
  | {
      readonly kind: "prism";
      readonly sides: number;
    }
  | {
      readonly kind: "pyramid";
      readonly sides: number;
    };

export interface TextShapeDefinition {
  readonly aliases: readonly string[];
  readonly category: "2d" | "3d" | "basic";
  readonly canonicalPrompt: string;
  readonly id: string;
  readonly label: string;
  readonly template: TextShapeTemplate;
}

const shape = (
  id: string,
  label: string,
  category: TextShapeDefinition["category"],
  aliases: readonly string[],
  template: TextShapeTemplate,
  canonicalPrompt = `Построй ${label.toLocaleLowerCase("ru")}`,
): TextShapeDefinition => ({
  aliases,
  canonicalPrompt,
  category,
  id,
  label,
  template,
});

export const textShapeCatalog: readonly TextShapeDefinition[] = [
  shape("point", "Точка", "basic", ["точ", "точка"], { kind: "point" }),
  shape("segment", "Отрезок", "basic", ["отр", "отрезок"], {
    kind: "line",
    mode: "segment",
  }),
  shape("line", "Прямая", "basic", ["прямая", "линия"], {
    kind: "line",
    mode: "line",
  }),
  shape("ray", "Луч", "basic", ["луч"], { kind: "line", mode: "ray" }),
  shape("angle", "Угол", "basic", ["угол"], {
    kind: "angle",
    variant: "standard",
  }),
  shape("acute-angle", "Острый угол", "basic", ["острый угол"], {
    kind: "angle",
    variant: "acute",
  }),
  shape("right-angle", "Прямой угол", "basic", ["прямой угол", "90 градусов"], {
    kind: "angle",
    variant: "right",
  }),
  shape("obtuse-angle", "Тупой угол", "basic", ["тупой угол"], {
    kind: "angle",
    variant: "obtuse",
  }),
  shape("triangle", "Треугольник", "2d", ["тре", "треугольник"], {
    kind: "triangle",
    variant: "standard",
  }),
  shape(
    "equilateral-triangle",
    "Равносторонний треугольник",
    "2d",
    ["равносторонний треугольник", "правильный треугольник"],
    { kind: "triangle", variant: "equilateral" },
  ),
  shape(
    "isosceles-triangle",
    "Равнобедренный треугольник",
    "2d",
    ["равнобедренный треугольник"],
    { kind: "triangle", variant: "isosceles" },
  ),
  shape(
    "right-triangle",
    "Прямоугольный треугольник",
    "2d",
    ["прямоугольный треугольник"],
    {
      kind: "triangle",
      variant: "right",
    },
  ),
  shape(
    "scalene-triangle",
    "Разносторонний треугольник",
    "2d",
    ["разносторонний треугольник"],
    {
      kind: "triangle",
      variant: "scalene",
    },
  ),
  shape(
    "acute-triangle",
    "Остроугольный треугольник",
    "2d",
    ["остроугольный треугольник"],
    {
      kind: "triangle",
      variant: "acute",
    },
  ),
  shape(
    "obtuse-triangle",
    "Тупоугольный треугольник",
    "2d",
    ["тупоугольный треугольник"],
    {
      kind: "triangle",
      variant: "obtuse",
    },
  ),
  shape(
    "inscribed-triangle",
    "Вписанный треугольник",
    "2d",
    [
      "вписанный треугольник",
      "треугольник вписанный в окружность",
      "треугольник в окружности",
    ],
    { kind: "triangle", variant: "inscribed" },
  ),
  shape(
    "circumscribed-triangle",
    "Описанный треугольник",
    "2d",
    [
      "описанный треугольник",
      "треугольник описанный около окружности",
      "треугольник вокруг окружности",
    ],
    { kind: "triangle", variant: "circumscribed" },
  ),
  shape("square", "Квадрат", "2d", ["квад", "квадрат"], {
    kind: "quadrilateral",
    variant: "square",
  }),
  shape("rectangle", "Прямоугольник", "2d", ["прямоугольник"], {
    kind: "quadrilateral",
    variant: "rectangle",
  }),
  shape("rhombus", "Ромб", "2d", ["ромб"], {
    kind: "quadrilateral",
    variant: "rhombus",
  }),
  shape("parallelogram", "Параллелограмм", "2d", ["параллелограмм"], {
    kind: "quadrilateral",
    variant: "parallelogram",
  }),
  shape("trapezoid", "Трапеция", "2d", ["трап", "трапеция"], {
    kind: "quadrilateral",
    variant: "trapezoid",
  }),
  shape(
    "isosceles-trapezoid",
    "Равнобедренная трапеция",
    "2d",
    ["равнобедренная трапеция"],
    {
      kind: "quadrilateral",
      variant: "isosceles-trapezoid",
    },
  ),
  shape(
    "right-trapezoid",
    "Прямоугольная трапеция",
    "2d",
    ["прямоугольная трапеция"],
    {
      kind: "quadrilateral",
      variant: "right-trapezoid",
    },
  ),
  shape("kite", "Дельтоид", "2d", ["дельтоид", "воздушный змей"], {
    kind: "quadrilateral",
    variant: "kite",
  }),
  shape(
    "inscribed-trapezoid",
    "Вписанная трапеция",
    "2d",
    [
      "вписанная трапеция",
      "трапеция вписанная в окружность",
      "трапеция в окружности",
    ],
    { kind: "quadrilateral", variant: "inscribed-trapezoid" },
  ),
  shape(
    "circumscribed-trapezoid",
    "Описанная трапеция",
    "2d",
    [
      "описанная трапеция",
      "трапеция описанная около окружности",
      "трапеция вокруг окружности",
    ],
    { kind: "quadrilateral", variant: "circumscribed-trapezoid" },
  ),
  ...[
    [5, "Пятиугольник", ["пятиугольник", "пентагон"]],
    [6, "Шестиугольник", ["шестиугольник", "гексагон"]],
    [7, "Семиугольник", ["семиугольник", "гептагон"]],
    [8, "Восьмиугольник", ["восьмиугольник", "октагон"]],
    [9, "Девятиугольник", ["девятиугольник", "нонагон"]],
    [10, "Десятиугольник", ["десятиугольник", "декагон"]],
    [11, "Одиннадцатиугольник", ["одиннадцатиугольник"]],
    [12, "Двенадцатиугольник", ["двенадцатиугольник", "додекагон"]],
  ].map(([sides, label, aliases]) =>
    shape(
      `regular-${String(sides)}-gon`,
      `Правильный ${String(label).toLocaleLowerCase("ru")}`,
      "2d",
      aliases as readonly string[],
      { kind: "regular-polygon", sides: Number(sides) },
    ),
  ),
  shape("circle", "Окружность", "2d", ["окр", "окружность", "круг"], {
    kind: "conic",
    variant: "circle",
  }),
  shape("ellipse", "Эллипс", "2d", ["эллипс", "овал"], {
    kind: "conic",
    variant: "ellipse",
  }),
  shape("semicircle", "Полуокружность", "2d", ["полуокружность", "полукруг"], {
    kind: "conic",
    variant: "semicircle",
  }),
  shape("cube", "Куб", "3d", ["куб"], { kind: "solid", variant: "cube" }),
  shape(
    "cuboid",
    "Прямоугольный параллелепипед",
    "3d",
    ["параллелепипед", "прямоугольный параллелепипед", "кубоид"],
    {
      kind: "solid",
      variant: "cuboid",
    },
  ),
  shape("sphere", "Сфера", "3d", ["сфера", "шар"], {
    kind: "solid",
    variant: "sphere",
  }),
  shape("hemisphere", "Полусфера", "3d", ["полусфера", "полушарие"], {
    kind: "solid",
    variant: "hemisphere",
  }),
  shape("cylinder", "Цилиндр", "3d", ["цил", "цилиндр"], {
    kind: "solid",
    variant: "cylinder",
  }),
  shape("cone", "Конус", "3d", ["кон", "конус"], {
    kind: "solid",
    variant: "cone",
  }),
  shape(
    "frustum",
    "Усечённый конус",
    "3d",
    ["усеченный конус", "усечённый конус"],
    {
      kind: "solid",
      variant: "frustum",
    },
  ),
  shape("tetrahedron", "Тетраэдр", "3d", ["тетраэдр", "треугольная пирамида"], {
    kind: "pyramid",
    sides: 3,
  }),
  shape("octahedron", "Октаэдр", "3d", ["октаэдр"], {
    kind: "solid",
    variant: "octahedron",
  }),
  ...[
    [3, "Треугольная призма", ["треугольная призма"]],
    [
      4,
      "Четырёхугольная призма",
      ["четырехугольная призма", "четырёхугольная призма"],
    ],
    [5, "Пятиугольная призма", ["пятиугольная призма"]],
    [6, "Шестиугольная призма", ["шестиугольная призма"]],
    [8, "Восьмиугольная призма", ["восьмиугольная призма"]],
  ].map(([sides, label, aliases]) =>
    shape(
      `prism-${String(sides)}`,
      String(label),
      "3d",
      aliases as readonly string[],
      {
        kind: "prism",
        sides: Number(sides),
      },
    ),
  ),
  ...[
    [
      4,
      "Четырёхугольная пирамида",
      ["четырехугольная пирамида", "четырёхугольная пирамида", "пирамида"],
    ],
    [5, "Пятиугольная пирамида", ["пятиугольная пирамида"]],
    [6, "Шестиугольная пирамида", ["шестиугольная пирамида"]],
    [8, "Восьмиугольная пирамида", ["восьмиугольная пирамида"]],
  ].map(([sides, label, aliases]) =>
    shape(
      `pyramid-${String(sides)}`,
      String(label),
      "3d",
      aliases as readonly string[],
      {
        kind: "pyramid",
        sides: Number(sides),
      },
    ),
  ),
];

export function normalizeTextShapeQuery(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function terms(definition: TextShapeDefinition): readonly string[] {
  return [definition.label, ...definition.aliases].map(normalizeTextShapeQuery);
}

function customAngleDefinition(query: string): TextShapeDefinition | undefined {
  const match = query
    .toLocaleLowerCase("ru")
    .replaceAll(",", ".")
    .match(
      /(?:^|\s)угол(?:\s+величиной)?\s*(\d+(?:\.\d+)?)\s*(?:°|град(?:ус(?:а|ов)?)?)?/u,
    );
  if (match?.[1] === undefined) return undefined;
  const degrees = Number(match[1]);
  if (!Number.isFinite(degrees) || degrees <= 0 || degrees >= 180) {
    return undefined;
  }
  const formatted = Number.isInteger(degrees)
    ? String(degrees)
    : String(Math.round(degrees * 10) / 10);
  return shape(
    `angle-${formatted.replace(".", "-")}`,
    `Угол ${formatted}°`,
    "basic",
    [`угол ${formatted}`, `угол ${formatted} градусов`],
    { degrees, kind: "angle", variant: "standard" },
    `Построй угол ${formatted}°`,
  );
}

export function suggestTextShapes(
  query: string,
  limit = 8,
): readonly TextShapeDefinition[] {
  const customAngle = customAngleDefinition(query);
  if (customAngle !== undefined) return [customAngle];
  const normalized = normalizeTextShapeQuery(query);
  if (normalized.length === 0) return textShapeCatalog.slice(0, limit);
  return textShapeCatalog
    .flatMap((definition, index) => {
      const values = terms(definition);
      const exact = values.includes(normalized);
      const prefix = values.some((value) => value.startsWith(normalized));
      const contains = values.some((value) => value.includes(normalized));
      if (!exact && !prefix && !contains) return [];
      return [{ definition, index, score: exact ? 0 : prefix ? 1 : 2 }];
    })
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, Math.max(1, limit))
    .map(({ definition }) => definition);
}

export function resolveTextShape(
  query: string,
): TextShapeDefinition | undefined {
  const customAngle = customAngleDefinition(query);
  if (customAngle !== undefined) return customAngle;
  const normalized = normalizeTextShapeQuery(query);
  if (normalized.length === 0) return undefined;
  const exact = textShapeCatalog.find((definition) =>
    terms(definition).includes(normalized),
  );
  if (exact !== undefined) return exact;
  const suggestions = suggestTextShapes(query, 2);
  return suggestions.length === 1 ? suggestions[0] : undefined;
}
