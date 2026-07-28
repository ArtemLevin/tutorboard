import { describe, expect, it, vi } from "vitest";

import {
  BoardHttpError,
  createBoardHttpRepository,
} from "../../../../src/adapters/board-http/public";
import {
  actorId,
  commandId,
  documentId,
  type BoardCommandEnvelope,
} from "../../../../src/core/public";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

const envelope: BoardCommandEnvelope = {
  actorId: actorId("user:tutor"),
  baseRevision: 0,
  commands: [
    {
      actorId: actorId("user:tutor"),
      id: commandId("command:rename"),
      kind: "core.document.rename",
      timestamp: "2026-07-28T18:00:00.000Z",
      title: "Synced",
    },
  ],
  documentId: documentId("document:lesson-1"),
  expectedDocumentSha256:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  idempotencyKey: "client:batch-1",
  schemaVersion: "1.0",
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
                commands: envelope.commands.map((command) => ({
                  ...command,
                  actorId: "user:other",
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
});
