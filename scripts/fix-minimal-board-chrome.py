from pathlib import Path


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


app_path = Path("src/app/App.tsx")
app = app_path.read_text()
app = one(app, 'import { ColorPalette } from "./ColorPalette";\n', "", "ColorPalette")
app = one(
    app,
    'import { StrokeStylePalette } from "./StrokeStylePalette";\n',
    "",
    "StrokeStylePalette",
)
app = one(
    app,
    "          onSelectionLockChange={setSelectionLock}\n"
    "          onSelectionStyleChange={updateSelectionStyle}\n",
    "          canTransformSelection={transformableObjectIds.length > 0}\n"
    "          onSelectionLockChange={setSelectionLock}\n"
    "          onSelectionStyleChange={updateSelectionStyle}\n"
    "          onSelectedTextCommit={(text) => {\n"
    "            if (isEditableTextObject(selectedEditableText)) {\n"
    "              updateSelectedText(selectedEditableText.id, text);\n"
    "            }\n"
    "          }}\n"
    "          onTransformSelection={transformSelectionBy}\n",
    "selection callbacks",
)
app = one(
    app,
    "          selectedLocked={selectedLocked}\n"
    "          selectedStyle={selectedStyle}\n",
    "          selectedLocked={selectedLocked}\n"
    "          selectedStyle={selectedStyle}\n"
    "          selectedText={\n"
    "            isEditableTextObject(selectedEditableText)\n"
    "              ? selectedEditableText.text\n"
    "              : null\n"
    "          }\n",
    "selected text",
)
app_path.write_text(app)


dock_path = Path("src/app/board-chrome/BoardToolDock.tsx")
dock = dock_path.read_text()
dock = one(
    dock,
    "  readonly onSelectionStyleChange: (patch: Partial<ObjectStyle>) => void;\n"
    "  readonly settingsOpen: boolean;\n",
    "  readonly onSelectionStyleChange: (patch: Partial<ObjectStyle>) => void;\n"
    "  readonly canTransformSelection: boolean;\n"
    "  readonly onSelectedTextCommit: (value: string) => void;\n"
    "  readonly onTransformSelection: (scaleFactor: number, rotationDelta: number) => void;\n"
    "  readonly selectedText: string | null;\n"
    "  readonly settingsOpen: boolean;\n",
    "dock props",
)
selection_controls = '''          {props.selectedText === null ? null : (
            <label className="dock-text-control">
              <span>Текст или формула</span>
              <textarea
                aria-label="Редактор выбранного текста"
                defaultValue={props.selectedText}
                key={props.selectedText}
                maxLength={100_000}
                onBlur={(event) =>
                  props.onSelectedTextCommit(event.currentTarget.value)
                }
                rows={2}
              />
            </label>
          )}
          {props.canTransformSelection ? (
            <div className="dock-transform-actions">
              <button
                aria-label="Уменьшить выделение на 10%"
                onClick={() => props.onTransformSelection(0.9, 0)}
                type="button"
              >
                −10%
              </button>
              <button
                aria-label="Увеличить выделение на 10%"
                onClick={() => props.onTransformSelection(1.1, 0)}
                type="button"
              >
                +10%
              </button>
              <button
                aria-label="Повернуть выделение на 15 градусов"
                onClick={() => props.onTransformSelection(1, 15)}
                type="button"
              >
                ↻ 15°
              </button>
            </div>
          ) : null}
'''
dock = one(
    dock,
    "          <StyleControls\n"
    "            allowFill\n"
    "            onChange={props.onSelectionStyleChange}\n"
    "            style={props.selectedStyle}\n"
    "          />\n",
    selection_controls
    + "          <StyleControls\n"
    + "            allowFill\n"
    + "            onChange={props.onSelectionStyleChange}\n"
    + "            style={props.selectedStyle}\n"
    + "          />\n",
    "selection UI",
)
dock_path.write_text(dock)


test_path = Path("tests/unit/modules/drawing/interaction.test.ts")
test = test_path.read_text()
test = one(
    test,
    "  createAddDrawingObjectCommand,\n",
    "  createAddDrawingObjectCommand,\n  drawingStyleDefaults,\n",
    "drawing defaults import",
)
helper = '''function styleFor(tool: DrawingToolId) {
  switch (tool) {
    case "drawing.pen": return drawingStyleDefaults.pen;
    case "drawing.smart-ink": return drawingStyleDefaults.smartInk;
    case "drawing.line": return drawingStyleDefaults.line;
    case "drawing.rectangle": return drawingStyleDefaults.rectangle;
    case "drawing.ellipse": return drawingStyleDefaults.ellipse;
    case "drawing.text": return drawingStyleDefaults.text;
  }
}

'''
test = one(
    test,
    'const idle: DrawingInteractionState = { kind: "idle" };\n\n',
    'const idle: DrawingInteractionState = { kind: "idle" };\n\n' + helper,
    "style helper",
)
for old, new, label in (
    ("    pointerId: 7,\n    text,\n", "    pointerId: 7,\n    style: styleFor(tool),\n    text,\n", "helper action"),
    ("      pointerId: 3,\n      text: \"\",\n", "      pointerId: 3,\n      style: styleFor(\"drawing.pen\"),\n      text: \"\",\n", "pen action"),
    ("      pointerId: 5,\n      text: \"\",\n", "      pointerId: 5,\n      style: styleFor(\"drawing.rectangle\"),\n      text: \"\",\n", "rectangle action"),
    ("      pointerId: 1,\n      text: \"\",\n", "      pointerId: 1,\n      style: styleFor(\"drawing.line\"),\n      text: \"\",\n", "line action"),
):
    test = one(test, old, new, label)
test_path.write_text(test)


styles_path = Path("src/app/styles.css")
styles = styles_path.read_text()
styles += '''

.dock-transform-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dock-transform-actions button {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #cbd4d8;
  border-radius: 9px;
  background: #fff;
  cursor: pointer;
}

.dock-text-control textarea {
  width: min(360px, 70vw);
  resize: vertical;
}
'''
styles_path.write_text(styles)
