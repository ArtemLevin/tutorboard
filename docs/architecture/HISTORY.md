# Bounded document history

Undo/redo is runtime application state. It is deliberately absent from
`BoardDocument 1.0`, persistence revisions, and the canvas adapter.

The history stores immutable document snapshots with a default limit of 100.
Only a successful application transaction enters history:

- one completed draw, drag, pan, lock, delete, SVG insertion, or document
  command creates one item;
- one atomic GeometryOS import creates one item;
- pointer previews, cancelled gestures, failed commands, and duplicate document
  references create no item.

Undo moves the current snapshot to the redo stack. Redo restores it. A new
successful command after undo clears the redo stack. Both operations flow
through the normal document-change callback, so local autosave observes the
restored document exactly like any other committed state.

The application exposes buttons plus `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and
`Ctrl/Cmd+Y`. Board history shortcuts do not capture keystrokes while the user
is editing an input, textarea, or content-editable surface.
