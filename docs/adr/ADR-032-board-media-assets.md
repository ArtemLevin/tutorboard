# ADR-032 — Board media assets outside the command journal

- Status: proposed
- Date: 2026-09-29
- Scope: TutorBoard + tutor-assistant-web
- Replaces: no existing ADR; preserves `image.embedded` as a compatibility path

## Context

TutorBoard currently imports PNG/JPEG/SVG/GIF as `image.embedded`. The complete
binary payload is encoded as a base64 `dataUrl` inside the BoardObject. This
works well for small portable local documents, but it does not scale to larger
media or synchronized standalone boards.

The actual limits on `main` are intentionally different at different layers:

- local image import: 8 MiB per file;
- `image.embedded.dataUrl`: at most 12 MiB;
- local BoardCommand JSON codec: 2 MiB;
- backend board command request/persistence: 5 MiB by default;
- TutorBoard JSON import: 10 MiB.

Therefore an 8 MiB GIF can be accepted by the picker while being impossible to
represent in a valid synchronized command. Raising the command limit would also
copy base64 bytes into IndexedDB pending commands, PostgreSQL command batches,
snapshots, pull/rebase responses and collaboration recovery traffic.

The backend already has private S3/MinIO storage, tenant-prefixed object keys,
bounded streaming, SHA-256 verification, MIME validation, lifecycle handling and
backup/restore. Board snapshots already use that storage. Reusing this boundary
is preferable to introducing a new binary storage service.

The requested product behavior is:

1. support substantially larger GIF/image files;
2. place supported image/GIF/video links on the board;
3. show the imported media content on the board;
4. preserve board ACL, collaboration, revisions and recovery.

## Decision

Large and remote media bytes live outside BoardDocument and outside the command
journal. Board commands carry only immutable media references.

### Board object

Add a new object kind in the next board contract:

```ts
interface MediaAssetObject extends BoardObjectBase {
  readonly kind: "media.asset";
  readonly assetId: string;
  readonly contentSha256: string;
  readonly byteSize: number;
  readonly fileName: string;
  readonly intrinsicSize: Size2;
  readonly mimeType:
    | "image/png"
    | "image/jpeg"
    | "image/gif"
    | "video/mp4";
  readonly size: Size2;
}
```

The object intentionally contains no storage key, public URL, signed URL or
original remote URL. `assetId` is board-scoped. `contentSha256` binds a board
revision to immutable bytes and lets client/backend detect metadata mismatch.

Existing `image.embedded` objects remain readable, writable and renderable.
There is no eager migration of historical documents.

The contract change requires a new BoardDocument/BoardSnapshot schema revision
and a new ordered command-envelope revision. Existing envelope revisions remain
accepted during rollout. The 2 MiB BoardCommand JSON limit is not increased.

### Backend persistence

Add board-owned media metadata, separate from material-generation artifacts.
The board domain should not reuse `ArtifactVersion`, because that table is
coupled to generation runs, lessons and publication workflow.

A `BoardMediaAsset` row is scoped by `organization_id + board_document_id`
and records at least:

- opaque asset id;
- storage key;
- SHA-256;
- byte size;
- MIME type;
- normalized filename;
- intrinsic width/height;
- storage status: uploading / available / quarantined / deleted;
- creator actor information when available;
- timestamps and diagnostics.

Storage keys remain private and tenant prefixed, for example
`<org>/boards/<board>/media/<asset>/<sha>`.

A successfully uploaded asset is retained for the board lifetime/history. Object
deletion does not immediately delete its bytes because old command revisions and
snapshots may still reference the asset. Physical purge follows board retention
and purge policy.

### Upload transaction

Media creation is a prerequisite to the BoardCommand that inserts it:

```text
client validates + hashes
        |
        v
upload asset -> backend validates/streams/scans -> asset AVAILABLE
        |
        v
core.objects.add(media.asset reference)
        |
        v
ordinary queue / revision / collaboration flow
```

Commands are never accepted with a forged or unavailable media reference.
Before committing an envelope containing `media.asset` objects, the backend
must verify that every referenced `assetId`:

- belongs to the same organization and board;
- is `available`;
- has the same SHA-256, size and MIME metadata carried by the object.

This check applies to every command shape capable of introducing complete board
objects, including add/paste/replace paths.

The upload endpoint uses the existing board read/write authority and the same
teacher/guest CSRF + access-epoch rules as board mutations. Guest revocation or
read-only downgrade is checked again before upload finalization.

Initial configurable limits:

- PNG/JPEG/GIF: 32 MiB per asset;
- MP4: 128 MiB per asset;
- existing dimension/pixel limits remain a lower-level image guard;
- per-board byte/count quotas and upload rate limiting are mandatory.

These are deployment defaults, not protocol constants.

### Storage and scanning

Use the existing `ArtifactStorage` implementation (S3/MinIO/local provider),
but add board-media validation before storage.

The current generic artifact MIME detector must learn GIF before GIF uploads can
use this path. Media validation is server authoritative: browser validation is
only UX.

For images/GIF, validate signature, dimensions and bounded decode complexity.
For animated GIFs, enforce both frame count and a total decoded-pixel budget.
For media-upload-enabled production, antivirus scanning is required; a board
profile with media uploads disabled may continue to start without ClamAV.

SVG stays on the existing sanitized embedded path for this increment. Moving SVG
to external media requires a server-side SVG sanitizer first.

### Read path

Expose an authenticated same-origin content route:

```text
GET /api/v1/boards/{boardId}/media/{assetId}/content
```

The route performs `board.read` authorization on every uncached request,
returns the verified MIME type, `nosniff`, ETag/content SHA metadata and never
reveals the S3 key.

Video responses support HTTP Range/206 so seeking does not require downloading
the complete MP4. The storage port must therefore gain a bounded range-read
operation rather than materializing complete video bytes in application memory.

TutorBoard gets a `BoardMediaRepository`/resolver port. Renderers consume a
resolved same-origin media source rather than constructing storage URLs.

### Remote URL import

A URL placed on the board is imported into owned immutable storage before the
board object is committed. TutorBoard does not hotlink arbitrary third-party
media and does not persist a remote URL as the rendering source.

Initial URL-import scope is direct HTTPS media resources resolving to supported
PNG/JPEG/GIF/MP4 content. Arbitrary HTML pages, iframes, YouTube/Vimeo pages and
provider embeds are a separate capability.

Backend remote fetch is an SSRF boundary and must:

- allow HTTPS only;
- reject credentials and non-HTTP schemes;
- resolve and reject loopback, private, link-local, multicast and other
  non-public destinations for IPv4 and IPv6;
- revalidate every redirect;
- use strict connect/read/total timeouts;
- send no user cookies, authorization headers or application credentials;
- enforce Content-Length when present and streamed byte limits regardless of it;
- validate the received signature/MIME instead of trusting URL extension;
- bound decompressed/downloaded size;
- avoid logging query strings or secrets from submitted URLs.

A production implementation should pin the validated destination or use a
restricted egress proxy so DNS rebinding cannot bypass address validation.

### Video behavior

`media.asset` with `video/mp4` is rendered from an `HTMLVideoElement`.
Playback state is local/ephemeral in the first increment. Play/pause/seek events
do not enter BoardDocument or the collaboration command log. Persistent board
state contains placement/size/rotation and immutable media identity only.

Synchronized playback, provider embeds and streaming services are explicitly out
of scope.

### Offline behavior

The first media-asset increment does not create commands that depend on an
unfinished upload. Large file and URL import therefore require connectivity.
After upload succeeds, the ordinary command can still survive a later disconnect
in the existing durable queue.

Small legacy embedded images remain available for local/offline workflows.
A later increment may add durable IndexedDB blob staging and upload dependencies,
but the current pending-command schema does not need to change for the first
release.

### Clipboard and document transfer

Within the same board, clipboard operations can preserve an `assetId`
reference. Cross-board media paste must create/authorize a media association for
the target board before committing the paste command.

The current `.tutorboard.json` export is self-contained only because embedded
bytes are inside the document and imports are capped at 10 MiB. Asset references
would break that property. Full completion of this milestone therefore requires
a portable board bundle format containing:

```text
document.json
assets/<assetId-or-sha>.<ext>
manifest.json
```

Legacy JSON import/export remains supported for documents that contain only
embedded media. Asset-backed boards must not silently export a non-portable JSON
file as if it were complete.

## Rollout order

1. Freeze contract/fixtures for `media.asset` and version migrations.
2. Backend BoardMediaAsset migration, ACL service, upload/download/range API and
   media-reference validation at command commit.
3. TutorBoard media repository/resolver and image/GIF asset rendering.
4. Route files over the embedded-safe threshold through the asset path.
5. Hardened remote HTTPS import.
6. MP4 rendering and Range E2E.
7. Portable board bundle import/export.
8. Optional durable offline blob staging.

Each stage must preserve old `image.embedded` documents and old command
envelope readers until the compatibility window is explicitly closed.

## Required verification

Release gates include:

- contract migration fixtures in both repositories;
- legacy embedded image regression tests;
- command size regression proving large media bytes never enter BoardCommand;
- PostgreSQL + S3/MinIO integration for upload/read/purge;
- tenant/board ACL and guest read-only/revoke tests;
- checksum/MIME/size/quarantine tests;
- forged/cross-board asset reference rejection;
- Range/206 video tests;
- SSRF tests for IPv4/IPv6 private targets and redirects;
- Chromium + Firefox image/GIF/MP4 browser flows;
- reconnect/rebase with media references;
- board deletion/retention and backup/restore checks;
- portable bundle round-trip.

## Consequences

The command/revision layer remains small and deterministic even for large media.
Server snapshots and collaboration recovery stop multiplying base64 payloads.
The same private object-storage/backup infrastructure is reused.

The trade-offs are an additional board-media API, a contract revision, explicit
asset lifetime management and online dependency for first-time large/remote
media import. These costs are preferable to raising JSON limits and allowing
binary payloads to dominate the durable command log.
