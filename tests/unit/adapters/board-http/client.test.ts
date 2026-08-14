import { describe, expect, it, vi } from "vitest";
import snapshotFixture from "../../../../contracts/board/v1/fixtures/board-snapshot.json" with { type: "json" };

import {
  BoardHttpError,
  createBoardHttpRepository,
} from "../../../../src/adapters/board-http/public";
import {
  actorId,
  commandId,
  documentId,
  type CurrentOrderedBoardCommandEnvelope,
} from "../../../../src/core/public";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

const envelope: CurrentOrderedBoardCommandEnvelope = {
  actorId: actorId("user:tutor"),
  baseRevision: 0,
  commands: [
    {
      command: {
        actorId: actorId("user:tutor"),
        id: commandId("command:rename"),
        kind: "core.document.rename",
        timestamp: "2026-07-28T18:00:00.000Z",
        title: "Synced",
      },
      order: { baseRevisionAtCreation: 0, lamport: 1 },
    },
  ],
  documentId: documentId("document:lesson-1"),
  expectedDocumentSha256:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  idempotencyKey: "client:batch-1",
  originId: "origin:test",
  schemaVersion: "1.5",
};

describe("Board HTTP repository", () => {
  it("uses same-origin session credentials and CSRF for writes", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          csrfToken: "csrf-token",
          organizationId: "organization:1",
          role: "tutor",
          userId: "user:tutor",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          currentDocumentSha256: envelope.expectedDocumentSha256,
          revision: 1,
          snapshotDue: false,
        }),
      );
    const repository = createBoardHttpRepository({
      baseUrl: "/api/v1",
      fetch: request,
      origin: "https://tutor.example.test",
    });

    const context = await repository.context();
    const result = await repository.push(envelope, context.csrfToken);

    expect(context.actorId).toBe("user:tutor");
    expect(result.status).toBe("accepted");
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://tutor.example.test/api/v1/boards/context",
    );
    const write = request.mock.calls[1]?.[1];
    expect(write?.credentials).toBe("same-origin");
    expect(write?.method).toBe("POST");
    expect((write?.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
      "csrf-token",
    );
  });

  it("returns bounded rebase data for a revision conflict", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: { currentRevision: 1 },
          hasMore: false,
          missingCommandBatches: [
            {
              actorUserId: "user:other",
              baseRevision: 0,
              createdAt: "2026-07-28T18:00:00.000Z",
              envelope: {
                ...envelope,
                actorId: "user:other",
                commands: envelope.commands.map((item) => ({
                  ...item,
                  command: { ...item.command, actorId: "user:other" },
                })),
                idempotencyKey: "remote:batch-1",
              },
              idempotencyKey: "remote:batch-1",
              payloadSha256:
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              revision: 1,
            },
          ],
        },
        409,
      ),
    );
    const repository = createBoardHttpRepository({
      fetch: request,
      origin: "https://tutor.example.test",
    });

    const result = await repository.push(envelope, "csrf-token");

    expect(result).toMatchObject({
      currentRevision: 1,
      hasMore: false,
      status: "conflict",
    });
  });

  it("accepts ordering metadata on a remotely committed batch", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        currentRevision: 1,
        documentId: envelope.documentId,
        hasMore: false,
        items: [
          {
            actorUserId: "user:tutor",
            baseRevision: 0,
            createdAt: "2026-07-28T18:00:00.000Z",
            envelope,
            idempotencyKey: envelope.idempotencyKey,
            lamportMax: 1,
            lamportMin: 1,
            payloadSha256:
              "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            revision: 1,
          },
        ],
      }),
    );
    const repository = createBoardHttpRepository({
      fetch: request,
      origin: "https://tutor.example.test",
    });

    const page = await repository.pull(envelope.documentId, 0);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      baseRevision: 0,
      lamportMax: 1,
      lamportMin: 1,
      revision: 1,
    });
  });

  it("loads the canonical snapshot contract including createdAt", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        board: {
          currentDocumentSha256: snapshotFixture.documentSha256,
          currentRevision: snapshotFixture.revision,
          documentId: snapshotFixture.documentId,
          lastSnapshotRevision: snapshotFixture.revision,
          lessonId: "lesson:lesson-01",
          snapshotDue: false,
          studentId: "student:lesson-01",
        },
        commandBatches: [],
        snapshot: snapshotFixture,
      }),
    );
    const repository = createBoardHttpRepository({
      fetch: request,
      origin: "https://tutor.example.test",
    });

    const recovery = await repository.load(
      documentId(snapshotFixture.documentId),
    );

    expect(recovery.snapshot?.createdAt).toBe(snapshotFixture.createdAt);
    expect(recovery.snapshot?.document.id).toBe(snapshotFixture.documentId);
  });

  it("accepts an empty digest only for a pristine revision-zero board", async () => {
    const initialBoard = {
      archivedAt: null,
      createdAt: "2026-07-28T18:00:00.000Z",
      currentDocumentSha256: "",
      currentRevision: 0,
      documentId: envelope.documentId,
      lastSnapshotRevision: 0,
      lessonId: "lesson:1",
      schemaVersion: "1.0",
      snapshotDue: false,
      studentId: "student:1",
      updatedAt: "2026-07-28T18:00:00.000Z",
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          board: initialBoard,
          commandBatches: [],
          snapshot: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          board: { ...initialBoard, currentRevision: 1 },
          commandBatches: [],
          snapshot: null,
        }),
      );
    const repository = createBoardHttpRepository({
      fetch: request,
      origin: "https://tutor.example.test",
    });

    const recovery = await repository.load(envelope.documentId);
    expect(recovery.board.currentDocumentSha256).toBe("");
    await expect(repository.load(envelope.documentId)).rejects.toMatchObject({
      code: "board.http.invalid-recovery",
    } satisfies Partial<BoardHttpError>);
  });

  it("rejects a cross-origin API configuration and classifies transport errors", async () => {
    expect(() =>
      createBoardHttpRepository({
        baseUrl: "https://api.example.test/api/v1",
        origin: "https://tutor.example.test",
      }),
    ).toThrow("same-origin");

    const repository = createBoardHttpRepository({
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")),
      origin: "https://tutor.example.test",
    });
    await expect(repository.context()).rejects.toMatchObject({
      code: "board.http.transport",
      retryable: true,
    } satisfies Partial<BoardHttpError>);
  });

  it("validates archive, collaboration, history and evidence contracts", async () => {
    const descriptor = {
      archivedAt: null,
      createdAt: "2026-07-28T18:00:00.000Z",
      currentDocumentSha256: envelope.expectedDocumentSha256,
      currentRevision: 1,
      documentId: envelope.documentId,
      lastSnapshotRevision: 1,
      lessonId: "lesson:1",
      schemaVersion: "1.0",
      snapshotDue: false,
      studentId: "student:1",
      updatedAt: "2026-07-28T18:00:00.000Z",
    };
    const evidence = {
      artifacts: {
        manifest: "/api/v1/board-evidence/evidence:1/manifest",
        png: null,
        svg: "/api/v1/board-evidence/evidence:1/svg",
      },
      documentId: envelope.documentId,
      documentSchemaVersion: "1.0",
      documentSha256: envelope.expectedDocumentSha256,
      evidenceId: "evidence:1",
      finalizedAt: "2026-07-28T18:00:00.000Z",
      lessonId: "lesson:1",
      manifestSha256:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      publishedAt: null,
      revision: 1,
      revokedAt: null,
      schemaVersion: "1.0",
      studentId: "student:1",
      transcriptLinks: [],
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ items: [descriptor], lessonId: "lesson:1" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          expiresInSeconds: 30,
          protocolVersion: "1.0",
          ticket: "opaque",
          websocketPath: "/api/v1/boards/document/collaboration",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          currentRevision: 1,
          documentId: envelope.documentId,
          items: [
            {
              actorUserId: "user:tutor",
              createdAt: "2026-07-28T18:00:00.000Z",
              documentSha256: envelope.expectedDocumentSha256,
              revision: 1,
              snapshotAvailable: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(evidence));
    const repository = createBoardHttpRepository({
      fetch: request,
      origin: "https://tutor.example.test",
    });

    const boards = await repository.listBoards("lesson:1");
    expect(boards[0]?.archivedAt).toBeNull();
    const ticket = await repository.collaborationTicket(
      envelope.documentId,
      "browser:1",
      "csrf",
    );
    expect(ticket.ticket).toBe("opaque");
    expect(await repository.listRevisions(envelope.documentId)).toHaveLength(1);
    const finalized = await repository.finalizeEvidence(
      envelope.documentId,
      1,
      envelope.expectedDocumentSha256,
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      "",
      [],
      "csrf",
    );
    expect(finalized.evidenceId).toBe("evidence:1");
    expect(request.mock.calls[3]?.[1]?.method).toBe("POST");
    expect(
      (request.mock.calls[3]?.[1]?.headers as Record<string, string>)[
        "X-CSRF-Token"
      ],
    ).toBe("csrf");
  });
  it("rejects malformed commands in a server conflict batch", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: { currentRevision: 1 },
          hasMore: false,
          missingCommandBatches: [
            {
              actorUserId: "user:other",
              baseRevision: 0,
              createdAt: "2026-07-28T18:00:00.000Z",
              envelope: {
                ...envelope,
                actorId: "user:other",
                commands: [
                  {
                    command: {
                      actorId: "user:other",
                      id: "command:malformed",
                      kind: "core.document.rename",
                      timestamp: "2026-07-28T18:00:00.000Z",
                    },
                    order: { baseRevisionAtCreation: 0, lamport: 1 },
                  },
                ],
                idempotencyKey: "remote:malformed",
              },
              idempotencyKey: "remote:malformed",
              payloadSha256:
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              revision: 1,
            },
          ],
        },
        409,
      ),
    );
    const repository = createBoardHttpRepository({
      fetch: request,
      origin: "https://tutor.example.test",
    });

    await expect(repository.push(envelope, "csrf-token")).rejects.toMatchObject(
      {
        code: "board.http.invalid-command-batch",
        retryable: false,
      } satisfies Partial<BoardHttpError>,
    );
  });
});
