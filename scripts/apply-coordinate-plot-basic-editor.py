from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return text.replace(old, new, 1)


panel_path = Path("src/app/CoordinatePlotEditorPanel.tsx")
panel = panel_path.read_text(encoding="utf-8")
panel = replace_once(
    panel,
    '''  const basicSeries =
    selectedSeries?.kind === "explicit"
      ? selectedSeries
      : (definition.series.find(({ kind }) => kind === "explicit") ?? null);''',
    '''  const basicSeries: Extract<PlotSeries, { readonly kind: "explicit" }> | null =
    selectedSeries?.kind === "explicit"
      ? selectedSeries
      : (definition.series.find(
          (series): series is Extract<
            PlotSeries,
            { readonly kind: "explicit" }
          > => series.kind === "explicit",
        ) ?? null);''',
    "explicit basic series narrowing",
)
panel_path.write_text(panel, encoding="utf-8")

print("Fixed explicit basic series type narrowing")
