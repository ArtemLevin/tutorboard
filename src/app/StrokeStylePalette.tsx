import type { StrokeStyle } from "../core/public";
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

export function StrokeStylePalette({
  onChange,
  value,
}: {
  readonly onChange: (value: StrokeStyle) => void;
  readonly value: StrokeStyle | undefined;
}) {
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
          </button>
        ))}
      </div>
    </fieldset>
  );
}
