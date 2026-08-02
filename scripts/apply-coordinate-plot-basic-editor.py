from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return text.replace(old, new, 1)


path = Path("src/app/CoordinatePlotEditorPanel.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''} from "react";

import {''',
    '''} from "react";
import { createPortal } from "react-dom";

import {''',
    "react dom portal import",
)
text = replace_once(
    text,
    '''      {advancedOpen ? (
        <div className="plot-editor-advanced-backdrop">''',
    '''      {advancedOpen
        ? createPortal(
            <div className="plot-editor-advanced-backdrop">''',
    "advanced portal start",
)
text = replace_once(
    text,
    '''          </section>
        </div>
      ) : null}

      {closeConfirmationOpen ? (''',
    '''          </section>
        </div>,
            document.body,
          )
        : null}

      {closeConfirmationOpen ? (''',
    "advanced portal end",
)
path.write_text(text, encoding="utf-8")
print("Portaled advanced graph settings to document.body")
