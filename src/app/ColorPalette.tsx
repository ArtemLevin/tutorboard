import { primaryStyleColors } from "./board-chrome/color-presets";
import "./color-palette.css";

export interface ColorPaletteProps {
  readonly allowNone?: boolean;
  readonly label: string;
  readonly onChange: (color: string | null) => void;
  readonly value: string | null;
}

export function ColorPalette({
  allowNone = false,
  label,
  onChange,
  value,
}: ColorPaletteProps) {
  return (
    <fieldset className="color-palette">
      <legend>{label}</legend>
      <div className="color-palette-options">
        {primaryStyleColors.map((color) => (
          <button
            aria-label={`${label}: ${color.label}`}
            aria-pressed={value === color.value}
            className="color-swatch"
            key={color.value}
            onClick={() => onChange(color.value)}
            style={{ backgroundColor: color.value }}
            title={color.label}
            type="button"
          />
        ))}
        {allowNone ? (
          <button
            aria-label={`${label}: Без цвета`}
            aria-pressed={value === null}
            className="color-swatch color-swatch-none"
            onClick={() => onChange(null)}
            title="Без заливки"
            type="button"
          />
        ) : null}
      </div>
    </fieldset>
  );
}
