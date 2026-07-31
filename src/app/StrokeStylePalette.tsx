import { useId, useRef, useState } from "react";

import type { StrokeStyle } from "../core/public";
import "./stroke-style-palette.css";

const defaultOption = { label: "Тонкая", value: "thin" } as const;
const options: readonly { label: string; value: StrokeStyle }[] = [
  defaultOption,
  { label: "Толстая", value: "thick" },
  { label: "Пунктирная", value: "dashed" },
  { label: "Точка-пунктир", value: "dash-dot" },
  { label: "Волнистая", value: "wavy" },
  { label: "Карандаш — скетчбук", value: "hand-pencil" },
  { label: "Ручка — скетчбук", value: "hand-pen" },
  { label: "Маркер", value: "marker" },
];

export function StrokeStylePalette({
  onChange,
  value,
}: {
  readonly onChange: (value: StrokeStyle) => void;
  readonly value: StrokeStyle | undefined;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedValue = value ?? defaultOption.value;
  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? defaultOption;

  return (
    <fieldset
      className="stroke-style-palette"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <legend>Стиль линии</legend>
      <div className="stroke-style-popover">
        <button
          aria-controls={menuId}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Стиль линии: ${selectedOption.label}`}
          className="stroke-style-trigger"
          data-stroke-style={selectedOption.value}
          onClick={() => setOpen((current) => !current)}
          ref={triggerRef}
          type="button"
        >
          <span aria-hidden="true" className="stroke-style-preview" />
          <span>{selectedOption.label}</span>
          <span aria-hidden="true" className="stroke-style-chevron">
            ▾
          </span>
        </button>

        {open ? (
          <div
            aria-label="Стиль линии"
            className="stroke-style-menu"
            id={menuId}
            role="menu"
          >
            {options.map((option) => (
              <button
                aria-checked={selectedValue === option.value}
                className="stroke-style-option"
                data-stroke-style={option.value}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                role="menuitemradio"
                type="button"
              >
                <span aria-hidden="true" className="stroke-style-preview" />
                <span>{option.label}</span>
                <span aria-hidden="true" className="stroke-style-check">
                  {selectedValue === option.value ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
