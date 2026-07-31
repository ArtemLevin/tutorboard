# Stroke styles

TutorBoard stores the optional `ObjectStyle.strokeStyle` token in BoardDocument 1.0. Missing values retain legacy rendering. The seven tokens are thin, thick, dashed, dash-dot, wavy, hand-pencil, and hand-pen.

Custom paths are deterministic functions of object geometry. No random state is serialized or generated at render time, preserving collaboration, replay, undo/redo, and export consistency. Smart Ink replacements inherit the source object style and remain editable through the selection inspector.
