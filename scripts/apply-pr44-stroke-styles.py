from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"marker not found in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/core/board/objects.ts",
    "export interface ObjectStyle {\n",
    "export const strokeStyles = [\n"
    "  \"thin\",\n"
    "  \"thick\",\n"
    "  \"dashed\",\n"
    "  \"dash-dot\",\n"
    "  \"wavy\",\n"
    "  \"hand-pencil\",\n"
    "  \"hand-pen\",\n"
    "] as const;\n\n"
    "export type StrokeStyle = (typeof strokeStyles)[number];\n\n"
    "export interface ObjectStyle {\n",
)
replace_once(
    "src/core/board/objects.ts",
    "  readonly strokeWidth: number;\n",
    "  readonly strokeWidth: number;\n  readonly strokeStyle?: StrokeStyle;\n",
)
replace_once(
    "src/core/public.ts",
    "  svgSanitizerPolicyVersion,\n",
    "  strokeStyles,\n  svgSanitizerPolicyVersion,\n",
)
replace_once(
    "src/core/public.ts",
    "  type SvgViewBox,\n",
    "  type StrokeStyle,\n  type SvgViewBox,\n",
)
replace_once(
    "src/core/board/validation/schema.ts",
    "import { boardObjectKinds, svgSanitizerPolicyVersion } from \"../objects\";\n",
    "import {\n  boardObjectKinds,\n  strokeStyles,\n  svgSanitizerPolicyVersion,\n} from \"../objects\";\n",
)
replace_once(
    "src/core/board/validation/schema.ts",
    "    strokeWidth: finiteNumberSchema.nonnegative(),\n",
    "    strokeWidth: finiteNumberSchema.nonnegative(),\n    strokeStyle: z.enum(strokeStyles).optional(),\n",
)

Path("src/adapters/canvas-konva/stroke-style.ts").write_text('''import type { StrokeStyle, Vec2 } from "../../core/public";

export interface ResolvedStrokeStyle {
  readonly dash?: readonly number[];
  readonly lineCap: "butt" | "round";
  readonly opacityMultiplier: number;
  readonly strokeWidth: number;
}

export function resolveStrokeStyle(
  style: StrokeStyle | undefined,
  fallbackWidth: number,
): ResolvedStrokeStyle {
  switch (style) {
    case "thin":
      return { lineCap: "round", opacityMultiplier: 1, strokeWidth: 2 };
    case "thick":
      return { lineCap: "round", opacityMultiplier: 1, strokeWidth: 6 };
    case "dashed":
      return {
        dash: [12, 8],
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: Math.max(2, fallbackWidth),
      };
    case "dash-dot":
      return {
        dash: [14, 6, 2, 6],
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: Math.max(2, fallbackWidth),
      };
    case "hand-pencil":
      return {
        dash: [2, 1],
        lineCap: "round",
        opacityMultiplier: 0.72,
        strokeWidth: Math.max(1.5, fallbackWidth),
      };
    case "hand-pen":
      return {
        lineCap: "round",
        opacityMultiplier: 0.94,
        strokeWidth: Math.max(2.5, fallbackWidth),
      };
    case "wavy":
      return {
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: Math.max(2, fallbackWidth),
      };
    default:
      return {
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: fallbackWidth,
      };
  }
}

export function createWavySegment(end: Vec2): readonly number[] {
  const length = Math.hypot(end.x, end.y);
  if (length === 0) return [0, 0, 0, 0];
  const normalX = -end.y / length;
  const normalY = end.x / length;
  const samples = Math.max(12, Math.ceil(length / 8));
  const points: number[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const amplitude = Math.sin(progress * Math.PI * 2 * Math.max(2, length / 36)) * 3;
    points.push(end.x * progress + normalX * amplitude, end.y * progress + normalY * amplitude);
  }
  return points;
}

export function createHandDrawnSegment(
  end: Vec2,
  intensity: number,
): readonly number[] {
  const length = Math.hypot(end.x, end.y);
  if (length === 0) return [0, 0, 0, 0];
  const normalX = -end.y / length;
  const normalY = end.x / length;
  const samples = Math.max(8, Math.ceil(length / 14));
  const points: number[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const deterministicNoise =
      Math.sin(index * 12.9898 + length * 0.017) * 0.65 +
      Math.sin(index * 4.123 + end.x * 0.011) * 0.35;
    const offset = deterministicNoise * intensity;
    points.push(end.x * progress + normalX * offset, end.y * progress + normalY * offset);
  }
  return points;
}
''', encoding="utf-8")

Path("src/adapters/canvas-konva/default-renderers.tsx").write_text('''import { Ellipse, Line, Rect, Text } from "react-konva";

import type { BoardObject, BoardObjectKind } from "../../core/public";
import { renderSafeMathLabel } from "../../shared/safe-math-label";
import { SvgRenderer } from "./svg-renderer";
import {
  KonvaRendererRegistry,
  type KonvaObjectRenderer,
} from "./renderer-registry";
import {
  createHandDrawnSegment,
  createWavySegment,
  resolveStrokeStyle,
} from "./stroke-style";

function expectKind<Kind extends BoardObjectKind>(object: BoardObject, kind: Kind): Extract<BoardObject, { readonly kind: Kind }> {
  if (object.kind !== kind) throw new Error(`Renderer ${kind} received ${object.kind}.`);
  return object as Extract<BoardObject, { readonly kind: Kind }>;
}

function commonShapeProps(object: BoardObject) {
  const resolved = resolveStrokeStyle(object.style.strokeStyle, object.style.strokeWidth);
  return {
    ...(resolved.dash === undefined ? {} : { dash: [...resolved.dash] }),
    hitStrokeWidth: Math.max(14, resolved.strokeWidth),
    lineCap: resolved.lineCap,
    lineJoin: "round" as const,
    name: "board-transform-target",
    opacity: object.style.opacity * resolved.opacityMultiplier,
    rotation: object.rotation,
    scaleX: object.scale.x,
    scaleY: object.scale.y,
    strokeWidth: resolved.strokeWidth,
    visible: object.visible,
    x: object.position.x,
    y: object.position.y,
  } as const;
}

function fillProps(object: BoardObject) { return object.style.fill === null ? {} : { fill: object.style.fill }; }
function strokeProps(object: BoardObject) { return object.style.stroke === null ? {} : { stroke: object.style.stroke }; }

function linePoints(object: Extract<BoardObject, { readonly kind: "drawing.line" }>): readonly number[] {
  switch (object.style.strokeStyle) {
    case "wavy": return createWavySegment(object.end);
    case "hand-pencil": return createHandDrawnSegment(object.end, 2.4);
    case "hand-pen": return createHandDrawnSegment(object.end, 1.15);
    default: return [0, 0, object.end.x, object.end.y];
  }
}

const renderers: readonly KonvaObjectRenderer[] = [
  { kind: "drawing.pen-stroke", render(object) { const stroke = expectKind(object, "drawing.pen-stroke"); return <Line {...commonShapeProps(stroke)} {...strokeProps(stroke)} points={stroke.points.flatMap(({ x, y }) => [x, y])} tension={stroke.style.strokeStyle === "hand-pen" ? 0.12 : 0} />; } },
  { kind: "drawing.line", render(object) { const line = expectKind(object, "drawing.line"); return <Line {...commonShapeProps(line)} {...strokeProps(line)} {...(line.lineStyle === "dashed" && line.style.strokeStyle === undefined ? { dash: [10, 6] } : {})} points={[...linePoints(line)]} tension={line.style.strokeStyle === "hand-pen" ? 0.18 : 0} />; } },
  { kind: "drawing.rectangle", render(object) { const rectangle = expectKind(object, "drawing.rectangle"); return <Rect {...commonShapeProps(rectangle)} {...fillProps(rectangle)} {...strokeProps(rectangle)} cornerRadius={8} height={rectangle.size.height} width={rectangle.size.width} />; } },
  { kind: "drawing.ellipse", render(object) { const ellipse = expectKind(object, "drawing.ellipse"); return <Ellipse {...commonShapeProps(ellipse)} {...fillProps(ellipse)} {...strokeProps(ellipse)} radiusX={ellipse.radius.x} radiusY={ellipse.radius.y} />; } },
  { kind: "svg-import.svg", render(object) { return <SvgRenderer object={expectKind(object, "svg-import.svg")} />; } },
  { kind: "drawing.text", render(object) { const text = expectKind(object, "drawing.text"); const label = renderSafeMathLabel(text.text); return <Text {...commonShapeProps(text)} fill={text.style.fill ?? text.style.stroke ?? "#17202a"} fontFamily="Inter, ui-sans-serif, system-ui" fontSize={22} lineHeight={1.35} text={label.displayText} />; } },
];

export function createDefaultKonvaRendererRegistry(): KonvaRendererRegistry { return new KonvaRendererRegistry(renderers); }
''', encoding="utf-8")

Path("src/app/StrokeStylePalette.tsx").write_text('''import type { StrokeStyle } from "../core/public";
import "./stroke-style-palette.css";

const options: readonly { label: string; value: StrokeStyle }[] = [
  { label: "Тонкая", value: "thin" },
  { label: "Толстая", value: "thick" },
  { label: "Пунктирная", value: "dashed" },
  { label: "Точка-пунктир", value: "dash-dot" },
  { label: "Волнистая", value: "wavy" },
  { label: "Карандаш", value: "hand-pencil" },
  { label: "Ручка", value: "hand-pen" },
];

export function StrokeStylePalette({ onChange, value }: { readonly onChange: (value: StrokeStyle) => void; readonly value: StrokeStyle | undefined }) {
  return (
    <fieldset className="stroke-style-palette">
      <legend>Стиль линии</legend>
      <div className="stroke-style-options">
        {options.map((option) => (
          <button
            aria-label={`Стиль линии: ${option.label}`}
            aria-pressed={(value ?? "thin") === option.value}
            className="stroke-style-option"
            data-stroke-style={option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.label}
            type="button"
          >
            <span aria-hidden="true" className="stroke-style-preview" />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
''', encoding="utf-8")

Path("src/app/stroke-style-palette.css").write_text('''.stroke-style-palette { border: 0; margin: 0; padding: 0; }
.stroke-style-palette legend { font-size: .78rem; font-weight: 700; margin-bottom: .4rem; }
.stroke-style-options { display: grid; gap: .35rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.stroke-style-option { align-items: center; background: #fff; border: 1px solid #cbd5e1; border-radius: .55rem; cursor: pointer; display: flex; gap: .45rem; min-height: 2.25rem; padding: .35rem .5rem; }
.stroke-style-option[aria-pressed="true"] { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, .18); }
.stroke-style-preview { display: block; height: 14px; position: relative; width: 42px; }
.stroke-style-preview::before { content: ""; left: 0; position: absolute; right: 0; top: 6px; }
[data-stroke-style="thin"] .stroke-style-preview::before { border-top: 2px solid #111827; }
[data-stroke-style="thick"] .stroke-style-preview::before { border-top: 6px solid #111827; top: 4px; }
[data-stroke-style="dashed"] .stroke-style-preview::before { border-top: 3px dashed #111827; }
[data-stroke-style="dash-dot"] .stroke-style-preview::before { background: repeating-linear-gradient(90deg,#111827 0 12px,transparent 12px 18px,#111827 18px 21px,transparent 21px 27px); height: 3px; }
[data-stroke-style="wavy"] .stroke-style-preview::before { content: "~~~~"; font-size: 18px; font-weight: 700; letter-spacing: -2px; line-height: 8px; top: 0; }
[data-stroke-style="hand-pencil"] .stroke-style-preview::before { border-top: 2px dotted rgba(17,24,39,.7); transform: rotate(-1deg); }
[data-stroke-style="hand-pen"] .stroke-style-preview::before { border-top: 3px solid #111827; border-radius: 50%; transform: rotate(1deg); }
''', encoding="utf-8")

replace_once(
    "src/app/App.tsx",
    'import { ColorPalette } from "./ColorPalette";\n',
    'import { ColorPalette } from "./ColorPalette";\nimport { StrokeStylePalette } from "./StrokeStylePalette";\n',
)
replace_once(
    "src/app/App.tsx",
    '''                <label>\n                  Толщина\n                  <input\n                    aria-label="Толщина обводки"''',
    '''                <StrokeStylePalette\n                  onChange={(strokeStyle) =>\n                    updateSelectionStyle({ strokeStyle })\n                  }\n                  value={selectedStyle.strokeStyle}\n                />\n                <label>\n                  Пользовательская толщина\n                  <input\n                    aria-label="Толщина обводки"''',
)

Path("src/adapters/canvas-konva/stroke-style.test.ts").write_text('''import { describe, expect, it } from "vitest";
import { createHandDrawnSegment, createWavySegment, resolveStrokeStyle } from "./stroke-style";

describe("stroke styles", () => {
  it("resolves the seven public styles", () => {
    expect(resolveStrokeStyle("thin", 4).strokeWidth).toBe(2);
    expect(resolveStrokeStyle("thick", 2).strokeWidth).toBe(6);
    expect(resolveStrokeStyle("dashed", 3).dash).toEqual([12, 8]);
    expect(resolveStrokeStyle("dash-dot", 3).dash).toEqual([14, 6, 2, 6]);
    expect(resolveStrokeStyle("wavy", 3).strokeWidth).toBe(3);
    expect(resolveStrokeStyle("hand-pencil", 2).opacityMultiplier).toBeLessThan(1);
    expect(resolveStrokeStyle("hand-pen", 2).strokeWidth).toBeGreaterThanOrEqual(2.5);
  });

  it("creates deterministic custom segments", () => {
    expect(createWavySegment({ x: 120, y: 0 })).toEqual(createWavySegment({ x: 120, y: 0 }));
    expect(createHandDrawnSegment({ x: 120, y: 20 }, 2)).toEqual(createHandDrawnSegment({ x: 120, y: 20 }, 2));
  });
});
''', encoding="utf-8")

selection = Path("tests/e2e/selection.spec.ts")
text = selection.read_text(encoding="utf-8")
text += '''\n\ntest("applies all seven line styles to a selected figure", async ({ page }) => {\n  const rectangle = await stagePoint(page, 350, 250);\n  await page.mouse.click(rectangle.x, rectangle.y);\n  for (const label of [\n    "Тонкая",\n    "Толстая",\n    "Пунктирная",\n    "Точка-пунктир",\n    "Волнистая",\n    "Карандаш",\n    "Ручка",\n  ]) {\n    const option = page.getByRole("button", { name: `Стиль линии: ${label}` });\n    await option.click();\n    await expect(option).toHaveAttribute("aria-pressed", "true");\n  }\n});\n'''
selection.write_text(text, encoding="utf-8")

Path("docs/architecture/STROKE_STYLES.md").write_text('''# Stroke styles\n\nTutorBoard stores the optional `ObjectStyle.strokeStyle` token in BoardDocument 1.0. Missing values retain legacy rendering. The seven tokens are thin, thick, dashed, dash-dot, wavy, hand-pencil, and hand-pen.\n\nCustom paths are deterministic functions of object geometry. No random state is serialized or generated at render time, preserving collaboration, replay, undo/redo, and export consistency. Smart Ink replacements inherit the source object style and remain editable through the selection inspector.\n''', encoding="utf-8")
