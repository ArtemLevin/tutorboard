# Text editing and safe math labels

User-authored `drawing.text` objects are edited through
`core.text.update`. The inspector commits on blur, so one editing session is
one undo item. Locked text is rejected. GeometryOS label content remains owned
by canonical geometry and cannot be rewritten by the generic text editor.

Text typography uses optional validated style fields: font size 8–96px,
line height 0.8–2.5, three safe font families, bold and italic. Legacy text
retains 22px and 1.35. A visual line break occurs at 20 Unicode characters,
preferably at word boundaries. The saved source text remains untouched to
preserve math markup, undo and the editing caret. Canvas and SVG/PDF exports
use the same layout. Selection, eraser and viewport-culling bounds also use
matching wrapped line counts and typography metrics. Bookmarks are hidden by default and can be shown through
Board Settings without changing stored bookmarks.

Math labels use an intentionally small offline formatter. Text wrapped in
`$…$` or `\\(…\\)` supports common Greek symbols, relations, simple
fractions, superscripts, and subscripts. The formatter:

- normalizes Unicode and replaces unsafe control characters;
- emits plain display text only, never HTML, SVG, or scriptable markup;
- neutralizes angle brackets even though Konva receives a text property;
- retains a plain accessible representation for semantic UI.

Unsupported commands degrade to literal text without executing or loading
anything. No network, TeX runtime, `innerHTML`, or dynamic code evaluation is
used.
