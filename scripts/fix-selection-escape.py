from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "src/app/App.tsx",
    '''      if (event.key === "Escape" && selectionInspectorObjectId !== null) {
        event.preventDefault();
        setSelectionInspectorObjectId(null);
        return;
      }
''',
    '''      if (event.key === "Escape" && selectionInspectorObjectId !== null) {
        event.preventDefault();
        setSelectionInspectorObjectId(null);
        return;
      }
      if (
        event.key === "Escape" &&
        selectionStateRef.current.interaction.kind !== "idle"
      ) {
        event.preventDefault();
        const result = reduceSelectionInteraction(selectionStateRef.current, {
          kind: "cancel",
        });
        selectionStateRef.current = result.state;
        setSelectionState(result.state);
        return;
      }
''',
    "selection Escape cancellation",
)
replace_once(
    "tests/e2e/selection.spec.ts",
    '''  const contour = await stagePoint(page, 300, 210);
  await page.mouse.click(contour.x, contour.y);
''',
    '''  const contour = await stagePoint(page, 350, 160);
  await page.mouse.click(contour.x, contour.y);
''',
    "direct selection contour point",
)
