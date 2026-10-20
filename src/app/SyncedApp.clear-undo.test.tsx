import "fake-indexeddb/auto";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as core from "../core/public";
import type {
  BoardCommand,
  BoardDocument,
  BoardServerRecovery,
  BoardSyncRepository,
  ServerBoardCommandBatch,
} from "../core/public";
import type { GuestBoardAccessContext } from "../core/access/public";
import type { BoardSyncEngineOptions } from "../modules/server-sync/public";
import {
  boardDocumentSha256,
  BoardSyncEngine,
} from "../modules/server-sync/public";
import { DexiePendingBoardCommandQueue } from "../adapters/persistence-dexie/public";
import {
  copyBoardSelection,
  createCutContentCommand,
} from "../modules/clipboard/public";
import { createDenseBoardDocument } from "../../tests/fixtures/dense-board";
import type { AppProps } from "./App";
import { SyncedApp } from "./SyncedApp";

const capture = vi.hoisted(() => ({
  props: null as AppProps | null,
  engine: null as BoardSyncEngine | null,
}));
vi.mock("../core/public", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/public")>();
  return { ...actual, reduceBoardDocument: vi.fn(actual.reduceBoardDocument) };
});
vi.mock("./App", () => ({
  App: (props: AppProps) => {
    capture.props = props;
    return (
      <div data-testid="board-count">{props.initialDocument?.order.length}</div>
    );
  },
}));
vi.mock("../modules/server-sync/public", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../modules/server-sync/public")>();
  return {
    ...actual,
    BoardSyncEngine: class extends actual.BoardSyncEngine {
      constructor(options: BoardSyncEngineOptions) {
        super(options);
        capture.engine = this;
      }
    },
  };
});
const id = core.documentId("document:dense-board");
const actor = core.actorId("guest:clear-undo");
const context: GuestBoardAccessContext = {
  schemaVersion: "1.0",
  accessEpoch: "epoch:clear",
  actorId: actor,
  boardId: id,
  cacheScopeId: "scope:clear",
  capabilities: ["board.read", "board.write"],
  csrfToken: "csrf:clear",
  displayName: "Undo test",
  principalType: "guest",
  role: "student",
};
const timestamp = "2026-10-14T00:00:00.000Z";
function cut(document: BoardDocument, commandKey: string) {
  const copied = copyBoardSelection(document, document.order);
  if (copied.status !== "ok") throw new Error("Missing content");
  return createCutContentCommand(copied.payload, {
    actorId: actor,
    id: core.commandId(commandKey),
    timestamp,
  });
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  capture.props = null;
  capture.engine = null;
});
it.each([1_000, 10_000])(
  "checks a %s-stroke clear without trial restore and submits only transportable Undo",
  async (strokeCount) => {
    const read = core.readBoardDocument(
      createDenseBoardDocument({
        strokeCount,
        strokeGeometry: "varied",
        staticCount: 0,
      }),
    );
    if (read.status !== "ok") throw new Error("Invalid fixture");
    const before = read.document;
    let server = before,
      revision = 0;
    let remote: ServerBoardCommandBatch[] = [];
    const sha256 = await boardDocumentSha256(before);
    const recovery: BoardServerRecovery = {
      board: {
        archivedAt: null,
        currentDocumentSha256: sha256,
        currentRevision: 0,
        documentId: id,
        lastSnapshotRevision: 0,
        lessonId: "lesson:test",
        snapshotDue: false,
        studentId: "student:test",
      },
      commandBatches: [],
      snapshot: {
        createdAt: before.createdAt,
        document: before,
        documentId: id,
        documentSha256: sha256,
        revision: 0,
        schemaVersion: "1.6",
      },
    };
    const unused = () => Promise.reject(new Error("Unexpected port"));
    const repository = {
      context: () =>
        Promise.resolve({
          actorId: actor,
          csrfToken: context.csrfToken,
          organizationId: "guest",
          role: "student" as const,
        }),
      load: () => Promise.resolve(recovery),
      pull: () => {
        const items = remote;
        remote = [];
        return Promise.resolve({
          currentRevision: revision,
          hasMore: false,
          items,
        });
      },
      push: vi.fn<BoardSyncRepository["push"]>(async (envelope) => {
        expect(envelope.baseRevision).toBe(revision);
        for (const { command } of envelope.commands) {
          const result = core.reduceBoardDocument(server, command);
          if (!result.ok) throw new Error(result.error.message);
          server = result.document;
        }
        expect(await boardDocumentSha256(server)).toBe(
          envelope.expectedDocumentSha256,
        );
        return {
          status: "accepted",
          currentDocumentSha256: envelope.expectedDocumentSha256,
          revision: ++revision,
          snapshotDue: false,
        };
      }),
      saveSnapshot: async () => {},
      ensureBoard: unused,
      collaborationTicket: unused,
      finalizeEvidence: unused,
      listEvidence: () => Promise.resolve([]),
      publishEvidence: unused,
      revokeEvidence: unused,
      recordClientEvent: async () => {},
    };
    const queue = new DexiePendingBoardCommandQueue(
      `undo-clear-${crypto.randomUUID()}`,
    );
    async function remoteCommand(command: BoardCommand) {
      const result = core.reduceBoardDocument(server, command);
      if (!result.ok) throw new Error(result.error.message);
      server = result.document;
      const expected = await boardDocumentSha256(server);
      remote = [
        {
          actorUserId: "user:remote",
          baseRevision: revision,
          createdAt: timestamp,
          idempotencyKey: `remote:${revision}`,
          payloadSha256: "0".repeat(64),
          revision: revision + 1,
          envelope: {
            actorId: command.actorId,
            baseRevision: revision,
            commands: [
              {
                command,
                order: {
                  baseRevisionAtCreation: revision,
                  lamport: revision + 1,
                },
              },
            ],
            documentId: id,
            expectedDocumentSha256: expected,
            idempotencyKey: `remote:${revision}`,
            originId: "origin:remote",
            schemaVersion: "1.7",
          },
        },
      ];
      revision += 1;
      vi.mocked(core.reduceBoardDocument).mockClear();
      const started = performance.now();
      await act(async () => {
        await capture.engine?.synchronize();
      });
      const trials = vi
        .mocked(core.reduceBoardDocument)
        .mock.calls.filter(
          ([, value]) => value.kind === "core.clipboard.paste",
        );
      expect(trials).toHaveLength(0);
      return performance.now() - started;
    }
    async function clear(document: BoardDocument, commandKey: string) {
      const expectedRevision = revision + 1;
      const command = cut(document, commandKey);
      const result = core.reduceBoardDocument(document, command);
      if (!result.ok) throw new Error(result.error.message);
      act(() =>
        capture.props?.onCommandCommitted?.(command, result.document, document),
      );
      await waitFor(
        () =>
          expect(capture.props?.persistenceStatus?.label).toBe(
            `Синхронизировано · r${expectedRevision}`,
          ),
        { timeout: 10_000 },
      );
      await waitFor(() =>
        expect(screen.getByTestId("board-count")).toHaveTextContent(/^0$/),
      );
      return result.document;
    }
    try {
      render(
        <SyncedApp documentId={id} queue={queue} repository={repository} />,
      );
      await screen.findByText(
        String(before.order.length),
        {},
        { timeout: 10_000 },
      );
      let clearSource = before;
      if (strokeCount === 10_000) {
        // A prior Undo must remain independently available after a large clear.
        const rename: BoardCommand = {
          actorId: actor,
          id: core.commandId("command:own-title"),
          timestamp,
          kind: "core.document.rename",
          title: "Own title",
        };
        const renamed = core.reduceBoardDocument(before, rename);
        if (!renamed.ok) throw new Error(renamed.error.message);
        act(() =>
          capture.props?.onCommandCommitted?.(rename, renamed.document, before),
        );
        await waitFor(
          () =>
            expect(capture.props?.persistenceStatus?.label).toBe(
              "Синхронизировано · r1",
            ),
          { timeout: 10_000 },
        );
        expect(capture.props?.collaborativeUndoAvailable).toBe(true);
        clearSource = renamed.document;
      }
      await clear(clearSource, "command:clear");
      for (const title of ["Remote one", "Remote two"]) {
        const ms = await remoteCommand({
          actorId: core.actorId("actor:remote"),
          id: core.commandId(`command:remote:${revision}`),
          timestamp,
          kind: "core.document.rename",
          title,
        });
        expect(capture.props?.collaborativeUndoAvailable).toBe(true);
        console.info("CLEAR_UNDO_CHECK", JSON.stringify({ strokeCount, ms }));
      }
      if (strokeCount === 10_000) {
        const expectedRevision = revision + 1;
        act(() => capture.props?.onCollaborativeUndo?.());
        await waitFor(
          () =>
            expect(capture.props?.persistenceStatus?.label).toBe(
              `Синхронизировано · r${expectedRevision}`,
            ),
          { timeout: 15_000 },
        );
        expect(server.order).toEqual(clearSource.order);
        expect(server.objects).toEqual(clearSource.objects);
        expect(repository.push.mock.calls.at(-1)?.[0].commands.length).toBeGreaterThan(1);
        return;
      }
      const object = before.objects[before.order[0]!]!;
      await remoteCommand({
        actorId: core.actorId("actor:remote"),
        id: core.commandId("command:unrelated"),
        timestamp,
        kind: "core.objects.add",
        objects: [{ ...object, id: core.boardObjectId("object:unrelated") }],
      });
      expect(capture.props?.collaborativeUndoAvailable).toBe(true);
      // A refused Undo must remain available. Rapid repeat input must not
      // consume a second history entry while the first receipt is pending.
      if (capture.engine === null) throw new Error("Missing sync engine");
      const receipt = vi
        .spyOn(capture.engine, "applyWithReceipt")
        .mockResolvedValueOnce(false);
      const pushedBeforeRefusal = repository.push.mock.calls.length;
      act(() => {
        capture.props?.onCollaborativeUndo?.();
        capture.props?.onCollaborativeUndo?.();
      });
      await waitFor(() =>
        expect(capture.props?.persistenceNotice).toContain(
          "Не удалось отменить операцию",
        ),
      );
      expect(receipt).toHaveBeenCalledTimes(1);
      expect(capture.props?.collaborativeUndoAvailable).toBe(true);
      expect(repository.push).toHaveBeenCalledTimes(pushedBeforeRefusal);

      const undoRevision = revision + 1;
      act(() => capture.props?.onCollaborativeUndo?.());
      await waitFor(
        () =>
          expect(capture.props?.persistenceStatus?.label).toBe(
            `Синхронизировано · r${undoRevision}`,
          ),
        { timeout: 10_000 },
      );
      await waitFor(
        () =>
          expect(screen.getByTestId("board-count")).toHaveTextContent(
            String(before.order.length + 1),
          ),
        { timeout: 10_000 },
      );
      expect(
        server.objects[core.boardObjectId("object:unrelated")],
      ).toBeDefined();
      expect(capture.props?.collaborativeUndoAvailable).toBe(false);
      // Queue the inverse immediately, before durable append or ACK completes.
      // apply() otherwise sees the pre-clear document and rejects the restore.
      const quickSource = server;
      const quickCut = cut(quickSource, "command:quick-clear");
      const quickResult = core.reduceBoardDocument(quickSource, quickCut);
      if (!quickResult.ok) throw new Error(quickResult.error.message);
      const quickRevision = revision + 2;
      act(() => {
        capture.props?.onCommandCommitted?.(
          quickCut,
          quickResult.document,
          quickSource,
        );
        capture.props?.onCollaborativeUndo?.();
      });
      await waitFor(
        () =>
          expect(capture.props?.persistenceStatus?.label).toBe(
            `Синхронизировано · r${quickRevision}`,
          ),
        { timeout: 10_000 },
      );
      expect(server.order).toEqual(quickSource.order);
      expect(screen.getByTestId("board-count")).toHaveTextContent(
        String(quickSource.order.length),
      );
      await clear(server, "command:clear-again");
      await remoteCommand({
        actorId: core.actorId("actor:remote"),
        id: core.commandId("command:collision"),
        timestamp,
        kind: "core.objects.add",
        objects: [object],
      });
      expect(capture.props?.collaborativeUndoAvailable).toBe(false);
      const pushed = repository.push.mock.calls.length;
      act(() => capture.props?.onCollaborativeUndo?.());
      expect(repository.push).toHaveBeenCalledTimes(pushed);
    } finally {
      cleanup();
      await queue.deleteDatabase();
    }
  },
  30_000,
);
