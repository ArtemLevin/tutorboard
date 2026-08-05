from __future__ import annotations

from pathlib import Path
import re

PATH = Path("tests/unit/modules/server-sync/sync.test.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} marker missing")
    return text.replace(old, new, 1)


def replace_after(text: str, anchor: str, old: str, new: str, label: str) -> str:
    start = text.find(anchor)
    if start < 0:
        raise SystemExit(f"{label} anchor missing")
    position = text.find(old, start)
    if position < 0:
        raise SystemExit(f"{label} marker missing")
    return text[:position] + new + text[position + len(old) :]


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "  createEmptyBoardDocument,\n",
        "  createEmptyBoardDocument,\n  reduceBoardDocument,\n",
        "reducer import",
    )

    text = replace_once(
        text,
        "}\n\nasync function confirmed(",
        '''}

function applied(document: BoardDocument, command: BoardCommand): BoardDocument {
  const result = reduceBoardDocument(document, command);
  if (!result.ok) {
    throw new Error("Test command could not be applied");
  }
  return result.document;
}

async function confirmed(''',
        "apply helper",
    )

    text = replace_once(
        text,
        '''function batch(
  revision: number,
  baseRevision: number,
  commands: readonly BoardCommand[],
  idempotencyKey = `remote:${revision}`,
): ServerBoardCommandBatch {
  return {
    actorUserId: "user:other",
    baseRevision,
    createdAt: commands[0]?.timestamp ?? "2026-07-28T18:00:00.000Z",
    envelope: {
      actorId: actorId("user:other"),
      baseRevision,
      commands,
      documentId: expectedDocumentId,
      expectedDocumentSha256: "a".repeat(64),
      idempotencyKey,
      schemaVersion: "1.2",
    },
    idempotencyKey,
    payloadSha256: "b".repeat(64),
    revision,
  };
}''',
        '''function batch(
  revision: number,
  baseRevision: number,
  commands: readonly BoardCommand[],
  idempotencyKey = `remote:${revision}`,
  expectedDocumentSha256 = "a".repeat(64),
): ServerBoardCommandBatch {
  return {
    actorUserId: "user:other",
    baseRevision,
    createdAt: commands[0]?.timestamp ?? "2026-07-28T18:00:00.000Z",
    envelope: {
      actorId: actorId("user:other"),
      baseRevision,
      commands,
      documentId: expectedDocumentId,
      expectedDocumentSha256,
      idempotencyKey,
      schemaVersion: "1.2",
    },
    idempotencyKey,
    payloadSha256: "b".repeat(64),
    revision,
  };
}''',
        "batch helper",
    )

    pattern = re.compile(r"new BoardSyncEngine\(\{(?P<body>.*?)\n    \}\);", re.S)
    patched = 0

    def add_callback(match: re.Match[str]) -> str:
        nonlocal patched
        body = match.group("body")
        if "onStateChange:" in body:
            return match.group(0)
        marker = re.search(r"\n      now: \(\) => [^\n]+,", body)
        if marker is None:
            raise SystemExit("BoardSyncEngine fixture without now callback")
        insert_at = marker.end()
        body = body[:insert_at] + "\n      onStateChange: () => undefined," + body[insert_at:]
        patched += 1
        return "new BoardSyncEngine({" + body + "\n    });"

    text = pattern.sub(add_callback, text)
    if patched != 3:
        raise SystemExit(f"expected 3 callback patches, got {patched}")

    text = replace_once(
        text,
        '''      result ?? {
        currentDocumentSha256: "c".repeat(64),
        revision: this.pushed.length,
        snapshotDue: false,
        status: "accepted",
      },''',
        '''      result ?? {
        currentDocumentSha256: envelope.expectedDocumentSha256,
        revision: envelope.baseRevision + 1,
        snapshotDue: false,
        status: "accepted",
      },''',
        "fake acceptance",
    )

    text = replace_once(
        text,
        '''    const offline = await engine.bootstrap();
    expect(offline).toMatchObject({''',
        '''    await engine.bootstrap();
    expect(states.at(-1)).toMatchObject({''',
        "offline bootstrap result",
    )

    rebase = 'it("rebases an offline command after a 409 and preserves its idempotency key"'
    text = replace_after(
        text,
        rebase,
        "missingCommandBatches: [batch(1, 0, [remote])],",
        '''missingCommandBatches: [
        batch(
          1,
          0,
          [remote],
          "remote:1",
          await boardDocumentSha256(applied(initialDocument(), remote)),
        ),
      ],''',
        "rebase batch",
    )

    offline = 'it("boots from the durable cache offline and drains the queue after reconnect"'
    text = replace_after(
        text,
        offline,
        "    const repository = new FakeRepository();",
        '''    const repository = new FakeRepository();
    const contextRequest = vi
      .spyOn(repository, "context")
      .mockRejectedValue({ retryable: true });''',
        "offline context",
    )
    text = replace_after(
        text,
        offline,
        '''    await engine.bootstrap();
    expect(states.at(-1)).toMatchObject({''',
        '''    await engine.bootstrap();
    contextRequest.mockRestore();
    expect(states.at(-1)).toMatchObject({''',
        "offline restore",
    )

    uncertain = 'it("acknowledges an uncertain retry already present in the server journal"'
    text = replace_after(
        text,
        uncertain,
        'commandBatches: [batch(1, 0, [command], "client:uncertain")],',
        '''commandBatches: [
        batch(
          1,
          0,
          [command],
          "client:uncertain",
          await boardDocumentSha256(applied(initialDocument(), command)),
        ),
      ],''',
        "uncertain batch",
    )
    text = replace_after(
        text,
        uncertain,
        "    const engine = new BoardSyncEngine({",
        "    const states: BoardSyncState[] = [];\n    const engine = new BoardSyncEngine({",
        "uncertain states",
    )
    text = replace_after(
        text,
        uncertain,
        "      onStateChange: () => undefined,",
        "      onStateChange: (state) => states.push(state),",
        "uncertain callback",
    )
    text = replace_after(
        text,
        uncertain,
        '''    const state = await engine.bootstrap();

    expect(state).toMatchObject({''',
        '''    await engine.bootstrap();

    expect(states.at(-1)).toMatchObject({''',
        "uncertain assertion",
    )

    parent = 'it("loads an assigned parent board without attempting to create it"'
    text = replace_after(
        text,
        parent,
        "    const engine = new BoardSyncEngine({",
        "    const states: BoardSyncState[] = [];\n    const engine = new BoardSyncEngine({",
        "parent states",
    )
    text = replace_after(
        text,
        parent,
        "      onStateChange: () => undefined,",
        "      onStateChange: (state) => states.push(state),",
        "parent callback",
    )
    text = replace_after(
        text,
        parent,
        '''    const state = await engine.bootstrap();

    expect(ensureBoard).not.toHaveBeenCalled();
    expect(state).toMatchObject({''',
        '''    await engine.bootstrap();

    expect(ensureBoard).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({''',
        "parent assertion",
    )
    text = replace_after(
        text,
        parent,
        "      readOnly: true,",
        '      role: "parent",',
        "parent role",
    )

    PATH.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
