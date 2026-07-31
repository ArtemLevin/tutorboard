# Image import

TutorBoard imports PNG, JPEG/JPG, GIF, and sanitized SVG from the file picker. Raster images may also be pasted from the operating-system clipboard with Ctrl/Cmd+V. Imported raster bytes are stored as data URLs in `media.image` BoardDocument objects, capped at 8 MiB input and 16,384 pixels per dimension. Initial display size is fitted within 720×520 world units while preserving aspect ratio.

Imported images are unlocked user objects. They participate in selection, movement, resize, rotation, layer ordering, grouping, copy/paste, undo/redo, persistence, and collaboration. GIF images retain browser animation; the Konva layer is refreshed while an animated image is mounted. SVG continues through the existing sanitizer and is never rendered from unsanitized markup.

Clipboard image payloads take precedence over TutorBoard's internal object clipboard. When the operating-system clipboard contains no image, Ctrl/Cmd+V continues to paste copied board objects.

The same Konva Transformer used for figures provides image resize and rotation handles.
