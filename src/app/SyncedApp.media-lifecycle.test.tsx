import "fake-indexeddb/auto";
import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardCollaborationClient } from "../adapters/board-websocket/public";
import type { BoardAccessControlEvent } from "../adapters/board-websocket/public";
import { BoardMediaResourceScope } from "../adapters/canvas-konva/public";
import { DexiePendingBoardCommandQueue } from "../adapters/persistence-dexie/public";
import { actorId, documentId, type DocumentId } from "../core/public";
import type { GuestBoardAccessContext } from "../core/access/public";
import { SyncedApp } from "./SyncedApp";

const publishedScopes: BoardMediaResourceScope[] = [];

vi.mock("./App", async () => {
  const { useContext } = await import("react");
  const { BoardMediaResourceScopeContext } =
    await import("../adapters/canvas-konva/public");
  return {
    App: () => {
      const resources = useContext(BoardMediaResourceScopeContext);
      if (resources !== null) publishedScopes.push(resources.scope);
      return (
        <div>
          Test board ready
          <span data-testid="media-context">
            {resources === null
              ? "missing"
              : [
                  resources.scope.boardId,
                  resources.resourceGeneration,
                  resources.enabled,
                ].join("|")}
          </span>
        </div>
      );
    },
  };
});

function guest(
  boardId: DocumentId,
  accessEpoch = "epoch:one",
): GuestBoardAccessContext {
  return {
    accessEpoch,
    actorId: actorId("guest:media-lifecycle"),
    boardId,
    cacheScopeId: "scope:media-lifecycle",
    capabilities: ["board.read", "collaboration.connect"],
    csrfToken: "csrf:media-lifecycle",
    displayName: "Guest",
    principalType: "guest",
    role: "student",
    schemaVersion: "1.0",
  };
}

function repository(boardId: DocumentId) {
  const unexpected = () => Promise.reject(new Error("Unexpected port"));
  return {
    context: () =>
      Promise.resolve({
        actorId: actorId("guest:media-lifecycle"),
        csrfToken: "csrf:media-lifecycle",
        organizationId: "guest",
        role: "student" as const,
      }),
    load: vi.fn(() =>
      Promise.resolve({
        board: {
          archivedAt: null,
          currentDocumentSha256: "0".repeat(64),
          currentRevision: 0,
          documentId: boardId,
          lastSnapshotRevision: 0,
          snapshotDue: false,
          createdAt: "2026-07-28T18:00:00.000Z",
        },
        commandBatches: [],
        snapshot: null,
      }),
    ),
    pull: () =>
      Promise.resolve({ currentRevision: 0, hasMore: false, items: [] }),
    push: unexpected,
    saveSnapshot: async () => {},
    ensureBoard: unexpected,
    collaborationTicket: unexpected,
    finalizeEvidence: unexpected,
    listEvidence: () => Promise.resolve([]),
    publishEvidence: unexpected,
    revokeEvidence: unexpected,
    recordClientEvent: async () => {},
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  publishedScopes.length = 0;
});

describe("F3.3.2-C board-scoped media lifecycle", () => {
  it("disposes the old board's leases on document switch and StrictMode cleanup", async () => {
    const firstBoardId = documentId("board:media-A");
    const secondBoardId = documentId("board:media-B");
    const queue = new DexiePendingBoardCommandQueue(
      "media-switch-" + crypto.randomUUID(),
    );
    const firstRepo = repository(firstBoardId);
    const secondRepo = repository(secondBoardId);
    vi.spyOn(BoardCollaborationClient.prototype, "start").mockImplementation(
      () => undefined,
    );
    vi.spyOn(BoardCollaborationClient.prototype, "stop").mockImplementation(
      () => undefined,
    );
    try {
      const view = render(
        <StrictMode>
          <SyncedApp
            accessContext={guest(firstBoardId)}
            documentId={firstBoardId}
            queue={queue}
            repository={firstRepo}
          />
        </StrictMode>,
      );
      await screen.findByText("Test board ready");
      const firstScope = publishedScopes.at(-1);
      expect(firstScope?.boardId).toBe(firstBoardId);
      const release = vi.fn();
      const lease = firstScope!.acquire(() => ({
        promise: Promise.resolve("loaded"),
        release,
      }));
      await lease.promise;

      view.rerender(
        <StrictMode>
          <SyncedApp
            accessContext={guest(secondBoardId)}
            documentId={secondBoardId}
            queue={queue}
            repository={secondRepo}
          />
        </StrictMode>,
      );
      await waitFor(() =>
        expect(screen.getByTestId("media-context").textContent).toContain(
          "board:media-B",
        ),
      );
      expect(firstScope?.snapshot()).toMatchObject({
        disposed: true,
        activeLeases: 0,
      });
      expect(release).toHaveBeenCalledOnce();
      const secondScope = publishedScopes.at(-1);
      expect(secondScope).not.toBe(firstScope);
      expect(secondScope?.snapshot()).toMatchObject({
        disposed: false,
        activeLeases: 0,
      });
    } finally {
      cleanup();
      await queue.deleteDatabase();
    }
  });

  it("revokes pending media synchronously before removing the board", async () => {
    const boardId = documentId("board:media-revoked");
    const queue = new DexiePendingBoardCommandQueue(
      "media-revoked-" + crypto.randomUUID(),
    );
    let accessHandler:
      | ((
          event: BoardAccessControlEvent,
        ) => boolean | Promise<boolean | void> | void)
      | undefined;
    vi.spyOn(BoardCollaborationClient.prototype, "start").mockImplementation(
      () => undefined,
    );
    vi.spyOn(BoardCollaborationClient.prototype, "stop").mockImplementation(
      () => undefined,
    );
    vi.spyOn(
      BoardCollaborationClient.prototype,
      "setAccessEventHandler",
    ).mockImplementation((handler) => {
      accessHandler = handler;
    });
    try {
      render(
        <SyncedApp
          accessContext={guest(boardId)}
          documentId={boardId}
          queue={queue}
          repository={repository(boardId)}
        />,
      );
      await screen.findByText("Test board ready");
      const scope = publishedScopes.at(-1)!;
      const release = vi.fn();
      let complete!: (value: string) => void;
      const lease = scope.acquire(() => ({
        promise: new Promise<string>((resolve) => {
          complete = resolve;
        }),
        release,
      }));
      const completion = expect(lease.promise).rejects.toMatchObject({
        name: "AbortError",
      });
      await act(async () => {
        await accessHandler?.({
          boardId,
          schemaVersion: "1.0",
          terminal: true,
          type: "access.revoked",
        });
      });
      await completion;
      expect(scope.snapshot()).toMatchObject({
        disposed: true,
        activeLeases: 0,
        pendingLeases: 0,
      });
      expect(release).toHaveBeenCalledOnce();
      complete("too late");
      await Promise.resolve();
      expect(
        await screen.findByText("Доступ к доске недоступен"),
      ).toBeInTheDocument();
    } finally {
      cleanup();
      await queue.deleteDatabase();
    }
  });

  it("invalidates both access generations during capability refresh", async () => {
    const boardId = documentId("board:media-updated");
    const queue = new DexiePendingBoardCommandQueue(
      "media-updated-" + crypto.randomUUID(),
    );
    let accessHandler:
      | ((
          event: BoardAccessControlEvent,
        ) => boolean | Promise<boolean | void> | void)
      | undefined;
    vi.spyOn(BoardCollaborationClient.prototype, "start").mockImplementation(
      () => undefined,
    );
    vi.spyOn(BoardCollaborationClient.prototype, "stop").mockImplementation(
      () => undefined,
    );
    vi.spyOn(
      BoardCollaborationClient.prototype,
      "setAccessEventHandler",
    ).mockImplementation((handler) => {
      accessHandler = handler;
    });
    const refreshed = guest(boardId, "epoch:two");
    try {
      render(
        <SyncedApp
          accessContext={guest(boardId)}
          documentId={boardId}
          queue={queue}
          repository={repository(boardId)}
          refreshAccessContext={() => Promise.resolve(refreshed)}
        />,
      );
      await screen.findByText("Test board ready");
      const scope = publishedScopes.at(-1)!;
      const release = vi.fn();
      const lease = scope.acquire(() => ({
        promise: new Promise<string>(() => undefined),
        release,
      }));
      const cancellation = expect(lease.promise).rejects.toMatchObject({
        name: "AbortError",
      });
      await act(async () => {
        await accessHandler?.({
          accessEpoch: "epoch:two",
          boardId,
          refreshRequired: true,
          schemaVersion: "1.0",
          type: "access.capabilities.changed",
        });
      });
      await cancellation;
      await waitFor(() =>
        expect(screen.getByTestId("media-context").textContent).toBe(
          "board:media-updated|2|true",
        ),
      );
      expect(release).toHaveBeenCalledOnce();
      expect(scope.snapshot()).toMatchObject({
        disposed: false,
        activeLeases: 0,
        resourceGeneration: 2,
      });
    } finally {
      cleanup();
      await queue.deleteDatabase();
    }
  });
});
