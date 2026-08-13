import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyBoardDocument,
  documentId,
  localDiagnosticSchemaVersion,
  localRevisionId,
  persistenceOperationId,
  type BoardDocument,
  type BoardDocumentDiagnosticBundle,
  type BoardDocumentLoadResult,
  type BoardDocumentRepository,
  type SaveBoardDocumentInput,
  type SaveBoardDocumentResult,
} from "../../../../src/core/public";
import { LocalDocumentAutosave } from "../../../../src/modules/local-persistence/public";

function document(title: string, updatedAt = "2026-07-24T08:00:00.000Z") {
  const created = createEmptyBoardDocument({
    createdAt: "2026-07-24T07:00:00.000Z",
    id: documentId("document:local-board"),
    title: "Initial",
  });
  return { ...created, title, updatedAt } satisfies BoardDocument;
}

class FakeRepository implements BoardDocumentRepository {
  readonly calls: SaveBoardDocumentInput[] = [];
  readonly results: SaveBoardDocumentResult[] = [];

  load(): Promise<BoardDocumentLoadResult> {
    return Promise.resolve({ status: "empty" });
  }

  save(input: SaveBoardDocumentInput): Promise<SaveBoardDocumentResult> {
    this.calls.push(input);
    const result = this.results.shift() ?? {
      duplicate: false,
      revisionId: localRevisionId(`revision:${input.operationId}`),
      status: "saved" as const,
    };
    return Promise.resolve(result);
  }

  diagnose(): Promise<BoardDocumentDiagnosticBundle> {
    return Promise.resolve({
      documentId: documentId("document:local-board"),
      generatedAt: "2026-07-24T08:00:00.000Z",
      head: null,
      recovery: null,
      revisions: [],
      schemaVersion: localDiagnosticSchemaVersion,
    });
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LocalDocumentAutosave", () => {
  it("debounces to the latest document and advances the revision", async () => {
    vi.useFakeTimers();
    const repository = new FakeRepository();
    const states: string[] = [];
    let operation = 0;
    const autosave = new LocalDocumentAutosave({
      createOperationId: () =>
        persistenceOperationId(`operation:${++operation}`),
      debounceMs: 50,
      initialRevisionId: null,
      now: () => "2026-07-24T08:00:00.000Z",
      onStateChange: (state) => states.push(state.kind),
      repository,
    });

    autosave.schedule(document("First"));
    autosave.schedule(document("Latest", "2026-07-24T08:01:00.000Z"));
    await vi.advanceTimersByTimeAsync(50);
    await autosave.flush();

    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.document.title).toBe("Latest");
    expect(repository.calls[0]?.expectedRevisionId).toBeNull();
    expect(states).toContain("saved");
  });

  it("persists the latest debounced document when the workspace is disposed", async () => {
    vi.useFakeTimers();
    const repository = new FakeRepository();
    const autosave = new LocalDocumentAutosave({
      createOperationId: () => persistenceOperationId("operation:dispose"),
      debounceMs: 350,
      initialRevisionId: null,
      now: () => "2026-07-24T08:00:00.000Z",
      onStateChange: () => undefined,
      repository,
    });

    autosave.schedule(document("Pending navigation save"));
    autosave.dispose();
    await autosave.flush();

    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.document.title).toBe("Pending navigation save");
  });

  it("starts the durable save before a pagehide handler returns", async () => {
    vi.useFakeTimers();
    const repository = new FakeRepository();
    const autosave = new LocalDocumentAutosave({
      createOperationId: () => persistenceOperationId("operation:pagehide"),
      debounceMs: 350,
      initialRevisionId: null,
      now: () => "2026-07-24T08:00:00.000Z",
      onStateChange: () => undefined,
      repository,
    });

    autosave.schedule(document("Pending page exit"));
    window.dispatchEvent(new Event("pagehide"));

    expect(repository.calls).toHaveLength(1);
    await autosave.flush();
    autosave.dispose();
  });

  it("retries an uncertain failure with the same durable operation ID", async () => {
    vi.useFakeTimers();
    const repository = new FakeRepository();
    repository.results.push(
      {
        code: "persistence.transport",
        message: "Commit outcome is unknown.",
        status: "failure",
      },
      {
        duplicate: true,
        revisionId: localRevisionId("revision:operation:1"),
        status: "saved",
      },
    );
    const autosave = new LocalDocumentAutosave({
      createOperationId: () => persistenceOperationId("operation:1"),
      debounceMs: 1,
      initialRevisionId: null,
      now: () => "2026-07-24T08:00:00.000Z",
      onStateChange: () => undefined,
      repository,
    });

    autosave.schedule(document("Retry"));
    await vi.advanceTimersByTimeAsync(1);
    await autosave.flush();
    autosave.retry();
    await autosave.flush();

    expect(repository.calls).toHaveLength(2);
    expect(repository.calls[0]?.operationId).toBe(
      repository.calls[1]?.operationId,
    );
  });

  it("surfaces optimistic conflicts instead of overwriting", async () => {
    vi.useFakeTimers();
    const repository = new FakeRepository();
    repository.results.push({
      currentRevisionId: localRevisionId("revision:other-tab"),
      status: "conflict",
    });
    const states: string[] = [];
    const autosave = new LocalDocumentAutosave({
      createOperationId: () => persistenceOperationId("operation:conflict"),
      debounceMs: 1,
      initialRevisionId: localRevisionId("revision:loaded"),
      now: () => "2026-07-24T08:00:00.000Z",
      onStateChange: (state) => states.push(state.kind),
      repository,
    });

    autosave.schedule(document("Conflict"));
    await vi.advanceTimersByTimeAsync(1);
    await autosave.flush();

    expect(states.at(-1)).toBe("conflict");
    expect(repository.calls[0]?.expectedRevisionId).toBe("revision:loaded");
  });
});
