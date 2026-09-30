# Embedded images

TutorBoard accepts PNG, JPEG/JPG, sanitized SVG, and GIF through the local file picker or the browser paste event. Each accepted file becomes an `image.embedded` user object and follows the ordinary `core.objects.add`, selection, transform, clipboard, undo/redo, persistence, and collaboration paths. During `Ctrl/Cmd+V`, supported system-clipboard image files take priority; the internal TutorBoard object clipboard remains the fallback when the event contains no image file. Native paste behavior is preserved while focus is inside an input, textarea, or editable text region.

Binary signatures determine raster formats. SVG crosses the existing sanitizer before storage. Each file is limited to 8 MiB, a batch to 24 MiB and 12 files, dimensions to 16,384 pixels per side, and decoded area to 64 megapixels. The document stores a portable base64 data URL, intrinsic dimensions, normalized file name, MIME type, and SHA-256 digest. Rejected files never create partial board objects. Persisted embedded SVG data is schema-validated during restore; an invalid latest revision is discarded in favor of the last valid revision.

Imported images are placed at the last canvas pointer position, or at the viewport center when no pointer sample exists. Multiple images receive a small cascade offset. Small assets are enlarged to a usable minimum display size, while large assets are fitted within 720 × 480 world units with their aspect ratio preserved. A completed import selects every inserted image and activates the selection tool immediately.

Animated GIFs keep browser animation through periodic Konva layer redraws. SVG diagnostic snapshots embed the validated data URL. Transparent pixels remain selectable through a rectangular hit area. Images use the standard Transformer, including move, resize, rotation, keyboard movement, lock, grouping, layers, copy/cut/paste, and delete.


## Synchronized media direction

`image.embedded` remains the compatibility and small/local-media format. It is
not the transport for large synchronized media.

The current size boundaries are intentionally different: the picker accepts up
to 8 MiB, the embedded data URL schema up to 12 MiB, while canonical
BoardCommand JSON is limited to 2 MiB. This means the picker limit is not a safe
server-sync limit. Raising only the picker or command limit would multiply
base64 payloads through IndexedDB, PostgreSQL command history, snapshots and
recovery traffic.

The next media milestone is defined by
`docs/adr/ADR-032-board-media-assets.md`:

- new `media.asset` BoardObject carrying immutable asset metadata/reference;
- private board-scoped S3/MinIO bytes outside commands and snapshots;
- authenticated same-origin media reads;
- direct HTTPS image/GIF/MP4 import through a hardened backend fetcher;
- HTTP Range support for video;
- legacy `image.embedded` compatibility;
- portable bundle import/export before the asset-backed workflow is considered
  complete.

Large/remote media commands are created only after their asset upload/import is
available. The 2 MiB BoardCommand JSON limit stays in place.
