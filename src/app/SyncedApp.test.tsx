import "fake-indexeddb/auto";
import * as boardHttp from "../adapters/board-http/public";
import { createGeometryOsHttpClient } from "../adapters/geometryos-http/public";
import { StandaloneBoardBootstrap } from "./StandaloneBoardBootstrap";
import { readEnvironment } from "./configuration/environment";
import { StrictMode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SyncedApp } from "./SyncedApp";
import { DexiePendingBoardCommandQueue } from "../adapters/persistence-dexie/public";
import { actorId, commandId, documentId } from "../core/public";
import type { GuestBoardAccessContext } from "../core/access/public";

vi.mock("./App", () => ({ App: () => <div>Review board ready</div> }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const id = documentId("board:review-strict");
const context: GuestBoardAccessContext = {
  accessEpoch: "epoch:review-1",
  actorId: actorId("guest:review"),
  boardId: id,
  cacheScopeId: "scope:review-strict",
  capabilities: ["board.read"],
  csrfToken: "csrf:review",
  displayName: "Guest",
  principalType: "guest",
  role: "student",
  schemaVersion: "1.0",
};
function repository() {
  const unexpected = () => Promise.reject(new Error("Unexpected unused port"));
  return {
    context: () =>
      Promise.resolve({
        actorId: context.actorId,
        csrfToken: context.csrfToken,
        organizationId: "guest",
        role: "student" as const,
      }),
    load: vi.fn(() =>
      Promise.resolve({
        board: {
          archivedAt: null,
          currentDocumentSha256: "0".repeat(64),
          currentRevision: 0,
          documentId: id,
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
for (const strict of [false, true]) {
  it(`mount reaches ready with StrictMode=${strict}`, async () => {
    const queue = new DexiePendingBoardCommandQueue(
      `review-strict-${crypto.randomUUID()}`,
    );
    const repo = repository();
    try {
      const app = (
        <SyncedApp
          accessContext={context}
          documentId={id}
          queue={queue}
          repository={repo}
        />
      );
      render(strict ? <StrictMode>{app}</StrictMode> : app);
      await screen.findByText("Review board ready", {}, { timeout: 2000 });
      expect(repo.load).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      await queue.deleteDatabase();
    }
  });
}

it("opens the standalone workspace in StrictMode with an effect-owned Dexie connection", async () => {
  const repo = {
    ...boardHttp.createStandaloneBoardHttpRepository(context),
    ...repository(),
  };
  vi.spyOn(boardHttp, "fetchStandaloneBoardAccessContext").mockResolvedValue(
    context,
  );
  vi.spyOn(boardHttp, "createStandaloneBoardHttpRepository").mockReturnValue(
    repo,
  );
  try {
    render(
      <StrictMode>
        <StandaloneBoardBootstrap
          boardId={id}
          environment={readEnvironment("test")}
          geometryOsClient={createGeometryOsHttpClient({
            baseUrl: "https://geometry.example.test",
          })}
        />
      </StrictMode>,
    );
    await screen.findByText("Review board ready");
    expect(repo.load).toHaveBeenCalledTimes(1);
  } finally {
    cleanup();
    await new DexiePendingBoardCommandQueue().deleteDatabase();
  }
});

it("does not publish an obsolete bootstrap failure after the workspace changes", async () => {
  const queue = new DexiePendingBoardCommandQueue(
    `p1-obsolete-${crypto.randomUUID()}`,
  );
  const oldRepo = repository();
  let rejectLoad: (error: unknown) => void = () => undefined;
  oldRepo.load.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectLoad = reject;
      }),
  );
  try {
    const view = render(
      <StrictMode>
        <SyncedApp
          accessContext={context}
          documentId={id}
          queue={queue}
          repository={oldRepo}
        />
      </StrictMode>,
    );
    await vi.waitFor(() => expect(oldRepo.load).toHaveBeenCalledTimes(1));
    view.rerender(
      <StrictMode>
        <SyncedApp
          accessContext={context}
          documentId={id}
          queue={queue}
          repository={repository()}
        />
      </StrictMode>,
    );
    await screen.findByText("Review board ready");
    rejectLoad(new Error("Obsolete failure"));
    await vi.waitFor(() =>
      expect(screen.queryByText(/Obsolete failure/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Review board ready")).toBeInTheDocument();
  } finally {
    cleanup();
    await queue.deleteDatabase();
  }
});

it("terminal ticket denial disposes sync and preserves durable pending work", async () => {
  const queue = new DexiePendingBoardCommandQueue(
    `p1-denial-${crypto.randomUUID()}`,
  );
  const repo = repository();
  const access = {
    ...context,
    capabilities: [
      "board.read",
      "board.write",
      "collaboration.connect",
    ] as const,
  };
  let rejectTicket: (error: unknown) => void = () => undefined;
  const ticket = vi.fn(
    () =>
      new Promise<never>((_, reject) => {
        rejectTicket = reject;
      }),
  );
  repo.collaborationTicket = ticket;
  const refresh = vi.fn(() =>
    Promise.reject(
      Object.assign(new Error("Access denied"), {
        status: 403,
        retryable: false,
      }),
    ),
  );
  try {
    render(
      <StrictMode>
        <SyncedApp
          accessContext={access}
          documentId={id}
          queue={queue}
          repository={repo}
          refreshAccessContext={refresh}
        />
      </StrictMode>,
    );
    await screen.findByText("Review board ready");
    await vi.waitFor(() => expect(ticket).toHaveBeenCalledTimes(1));
    const pending = await queue.enqueue(id, "pending:denial", {
      actorId: context.actorId,
      id: commandId("command:denial"),
      kind: "core.document.rename",
      timestamp: "2026-09-30T00:00:00.000Z",
      title: "Unsynced work",
    });
    rejectTicket({ status: 403, retryable: false });
    await screen.findByText("Доступ к доске недоступен");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(await queue.list(id)).toEqual([pending]);
  } finally {
    cleanup();
    await queue.deleteDatabase();
  }
});
