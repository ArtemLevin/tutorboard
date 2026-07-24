# Safe SVG import boundary

PR 2.7 treats every SVG byte as attacker-controlled input. SVG is stored and
rendered as one opaque visual board object; it never provides GeometryOS or GIR
semantics.

## Ownership and data flow

| Owner | Responsibility |
| --- | --- |
| `modules/svg-import` | preflight limits, XML inspection, DOMPurify policy, canonicalization, object/command factories and stored-object revalidation |
| `core` | `svg-import.svg`, BoardDocument 0.2 schema, 0.1 → 0.2 migration and deterministic serialization |
| `adapters/canvas-konva` | Blob URL and image decode lifecycle for already validated canonical SVG |
| `app` | file access, command metadata, viewport-centred insertion and recovery UI |

```text
File / restored JSON
        ↓
size and XML preflight
        ↓
strict allow-list inspection
        ↓
DOMPurify
        ↓
post-sanitization inspection
        ↓
canonical SVG string
        ↓
one svg-import.svg object
        ↓
Blob URL → HTMLImageElement → Konva Image
```

Only `modules/svg-import` may import DOMPurify. The canvas adapter never parses,
sanitizes or mutates SVG content.

## Deny-by-default policy

The policy accepts a bounded subset of static SVG primitives, paths, text,
gradients and clipping. It rejects scripts, event attributes, `foreignObject`,
HTML embedding, links, images, CSS style blocks/attributes, filters, animation,
external resources, executable/data/blob/file URLs, XML entities, doctypes and
processing instructions.

References are restricted to existing local fragment IDs in `fill`, `stroke` and
`clip-path`. Unsupported constructs fail the whole import rather than being
silently removed, because silent sanitization can materially alter a teaching
artifact.

Operational policy version:

```text
tutorboard.svg-sanitizer/1
```

A stored object is re-sanitized before it reaches the renderer. Canonical output,
policy version, viewBox and display size must match exactly. A mismatch opens the
existing recovery UI; the immutable IndexedDB revision remains available in the
diagnostic bundle.

## Limits

| Limit | Value |
| --- | ---: |
| input and canonical output | 512 KiB |
| elements | 5,000 |
| nesting depth | 32 |
| attributes per element | 64 |
| total attributes | 20,000 |
| path data | 128,000 characters |
| stored display dimension | 16,384 |
| viewBox span / absolute origin | 1,000,000 |
| aspect ratio | 1,000:1 |

The input byte limit is enforced before XML parsing. DOMParser and DOMPurify are
synchronous browser APIs, so PR 2.7 does not claim a hard pre-emptive parsing
timeout. Measured malicious fixtures and strict complexity limits bound the
spike; a worker-compatible parser is required if measured main-thread latency is
not acceptable.

## Stored contract

`BoardDocument 0.2` adds only `svg-import.svg`. The object stores canonical
sanitized text, normalized viewBox, display size and sanitizer policy version.
The original file name and rejected source are not stored in the document or
diagnostics.

Documents at version 0.1 migrate to 0.2 by changing only the schema version after
full legacy validation. IDs, objects, order, groups, imports and viewport remain
unchanged. Old IndexedDB revisions stay immutable; the next successful mutation
writes a 0.2 revision.

## Rendering and interaction

The renderer creates a Blob URL from canonical SVG, decodes it as an
`HTMLImageElement`, and draws it with Konva Image. URLs are revoked on source
change and unmount. Decode failure renders a non-executable placeholder and does
not crash the stage.

Selection uses the stored rectangular display size. Existing generic commands
provide movement, lock/unlock and delete. One file import creates exactly one
`core.objects.add` command and automatically selects the inserted object.

## Diagnostics

User-visible errors expose stable `svg.*` codes and generic explanations only.
They never include the SVG source, local file path, external URL value or board
content. This enforces `SEC-008` while keeping malicious fixtures diagnosable.

## Residual risks

- Static rectangular selection bounds do not match arbitrary path silhouettes.
- Blob/image decoding remains browser-dependent; failure is contained by the
  placeholder path.
- Parsing and sanitization remain main-thread synchronous under the declared
  limits.
- Changing the sanitizer allow-list requires a new policy-version compatibility
  decision; existing objects are never rewritten silently.
