# Object transforms

TutorBoard exposes resize and rotation handles for an idle selection of unlocked,
ungrouped user objects. The same path applies to native drawing objects and Smart
Ink replacements because both use the BoardDocument `position`, `rotation` and
`scale` fields.

Konva owns only the interaction preview. On transform completion the app captures
full original and replacement snapshots and emits `core.objects.replace`. Local
history and collaborative journals therefore receive one atomic deterministic
command, and undo restores the exact previous transform.

Imported GeometryOS objects and grouped or locked objects do not expose transform
handles. Their provenance and group-level semantics remain governed by their
existing explicit commands. The Transformer disables flips and enforces a minimum
on-screen box size. Rotation snaps to 45-degree increments within five degrees;
free rotation remains available outside that tolerance.
