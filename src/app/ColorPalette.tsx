import "./color-palette.css";

const primaryStyleColors = [
  { label: "Чёрный", value: "#111827" },
  { label: "Красный", value: "#dc2626" },
  { label: "Синий", value: "#2563eb" },
  { label: "Зелёный", value: "#16a34a" },
  { label: "Жёлтый", value: "#facc15" },
] as const;

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
