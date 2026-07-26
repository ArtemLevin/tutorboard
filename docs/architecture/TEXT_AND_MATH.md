# Text editing and safe math labels

User-authored `drawing.text` objects are edited through
`core.text.update`. The inspector commits on blur, so one editing session is
one undo item. Locked text is rejected. GeometryOS label content remains owned
by canonical geometry and cannot be rewritten by the generic text editor.

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
