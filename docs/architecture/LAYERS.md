# Layers and groups

`BoardDocument.order` remains the only z-order source. Layer commands move a
stable selection to the front/back or one step forward/backward while
preserving relative order inside that selection. Locked objects and locked
groups cannot be reordered.

Visibility is a persisted presentation flag and does not remove an object from
ordering, groups, selection geometry, or provenance. Locking prevents content,
transform, grouping, and z-order changes; the layers UI can still make a locked
object visible so that it can be recovered.

User objects can be grouped only as one atomic `core.groups.add` command.
Ungrouping clears both sides of membership in one `core.groups.remove` command.
GeometryOS root groups cannot be removed because they own the import provenance
closure and its visual-transform boundary.

The layers panel presents front-to-back objects, visibility, effective lock
state, front/back actions, and group management. Every action enters document
history exactly once and is validated by the core reducer.
