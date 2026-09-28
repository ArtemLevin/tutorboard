export const primaryStyleColors = [
  { label: "Чёрный", value: "#111827" },
  { label: "Красный", value: "#dc2626" },
  { label: "Синий", value: "#2563eb" },
  { label: "Зелёный", value: "#16a34a" },
  { label: "Жёлтый", value: "#facc15" },
] as const;

export type PrimaryStyleColor = (typeof primaryStyleColors)[number]["value"];

export function primaryStyleColorByIndex(index: number): PrimaryStyleColor | null {
  return primaryStyleColors[index]?.value ?? null;
}
