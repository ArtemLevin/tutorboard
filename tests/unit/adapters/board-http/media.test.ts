import { describe, expect, it, vi } from "vitest";

import {
  BoardHttpError,
  createBoardHttpRepository,
  createStandaloneBoardHttpRepository,
} from "../../../../src/adapters/board-http/public";
import {
  actorId,
  boardObjectId,
  documentId,
  type MediaAssetObject,
} from "../../../../src/core/public";

const boardId = documentId("board:media-test");
const assetId = "asset:media-test";
const contentSha256 = "a".repeat(64);
const fileName = "урок 1.png";
const imageBytes = new Uint8Array([137, 80, 78, 71]);
const metadata = {
  assetId,
  byteSize: imageBytes.byteLength,
  contentSha256,
  createdAt: "2026-10-08T00:00:00+00:00",
  fileName,
  intrinsicSize: { height: 1, width: 1 },
  mimeType: "image/png",
  status: "available",
} as const;

const imageObject: MediaAssetObject = {
  assetId,
  byteSize: metadata.byteSize,
  contentSha256,
  fileName,
  groupId: null,
  id: boardObjectId("object:media-test"),
  intrinsicSize: metadata.intrinsicSize,
  kind: "media.asset",
  locked: false,
  mimeType: "image/png",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  size: { height: 100, width: 100 },
  source: { kind: "user" },
  style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
  visible: true,
};

function jsonResponse(value: unknown, status = 201): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function contentResponse(
  input: {
    readonly hash?: string;
    readonly mime?: string;
    readonly status?: number;
    readonly bytes?: Uint8Array;
  } = {},
): Response {
  return new Response(new Uint8Array(input.bytes ?? imageBytes).buffer, {
    headers: {
      "Content-Type": input.mime ?? "image/png",
      "X-Content-SHA256": input.hash ?? contentSha256,
    },
    status: input.status ?? 200,
  });
}

function uploadInput(signal?: AbortSignal) {
  return {
    body: new Blob([imageBytes], { type: "image/png" }),
    contentSha256,
    csrfToken: "csrf:media",
    documentId: boardId,
    fileName,
    idempotencyKey: "upload:media:01",
    mimeType: "image/png" as const,
    ...(signal === undefined ? {} : { signal }),
  };
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

const origin = "https://board.example.test";

describe("board media HTTP adapter", () => {
  it("uploads raw bytes with same-origin credentials, SHA, idempotency and CSRF", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(metadata));
    const repository = createBoardHttpRepository({ fetch: request, origin });

    const result = await repository.uploadMedia(uploadInput());

    expect(result).toEqual(metadata);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    const parsed = requestUrl(url);
    expect(parsed.origin).toBe(origin);
    expect(parsed.pathname).toBe("/api/v1/boards/board%3Amedia-test/media");
    expect(parsed.searchParams.get("fileName")).toBe(fileName);
    expect(init?.credentials).toBe("same-origin");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(Blob);
    expect(await (init?.body as Blob).arrayBuffer()).toEqual(imageBytes.buffer);
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("image/png");
    expect(headers.get("X-Content-SHA256")).toBe(contentSha256);
    expect(headers.get("X-Idempotency-Key")).toBe("upload:media:01");
    expect(headers.get("X-CSRF-Token")).toBe("csrf:media");
    expect(JSON.stringify(result)).not.toContain("storageKey");
  });

  it("rejects forged or stale authoritative descriptors", async () => {
    for (const changed of [
      { contentSha256: "f".repeat(64) },
      { byteSize: metadata.byteSize + 1 },
      { mimeType: "image/gif" },
      { status: "uploading" },
      { storageKey: "forbidden/internal/path" },
    ]) {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(jsonResponse({ ...metadata, ...changed }));
      const repository = createBoardHttpRepository({ fetch, origin });
      await expect(repository.uploadMedia(uploadInput())).rejects.toMatchObject(
        {
          code: "board.media.invalid-descriptor",
          retryable: false,
        },
      );
    }
  });

  it("rejects upload failure, invalid fields and unapproved cross-origin gateways", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ detail: "Too many uploads" }, 429));
    const repository = createBoardHttpRepository({ fetch, origin });
    await expect(repository.uploadMedia(uploadInput())).rejects.toMatchObject({
      code: "board.http.429",
      retryable: true,
    });
    await expect(
      repository.uploadMedia({ ...uploadInput(), contentSha256: "abc" }),
    ).rejects.toMatchObject({
      code: "board.media.invalid-upload",
      retryable: false,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(() =>
      createBoardHttpRepository({
        baseUrl: "https://external.example.test/api/v1",
        fetch,
        origin,
      }),
    ).toThrow("same-origin");
  });

  it("aborts upload before transport and does not send a command", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const repository = createBoardHttpRepository({ fetch, origin });
    const abort = new AbortController();
    abort.abort();
    await expect(
      repository.uploadMedia(uploadInput(abort.signal)),
    ).rejects.toMatchObject({
      code: "board.media.aborted",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves a lazy authenticated content source and validates returned bytes/headers", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(contentResponse());
    const repository = createBoardHttpRepository({ fetch, origin });
    const source = repository.resolveMediaContentSource(boardId, imageObject);

    expect(source.url).toBe(
      "https://board.example.test/api/v1/boards/board%3Amedia-test/media/asset%3Amedia-test/content",
    );
    expect(source.cacheKey).toContain(`${boardId}:${assetId}:${contentSha256}`);
    expect(fetch).not.toHaveBeenCalled();
    const blob = await source.loadBlob();
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(imageBytes.byteLength);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]?.credentials).toBe("same-origin");
    expect(fetch.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it("refuses content MIME/hash/size mismatches, errors and invalid media references", async () => {
    for (const response of [
      contentResponse({ hash: "b".repeat(64) }),
      contentResponse({ mime: "image/gif" }),
      contentResponse({ bytes: new Uint8Array([1]) }),
    ]) {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(response);
      const repository = createBoardHttpRepository({ fetch, origin });
      await expect(
        repository.resolveMediaContentSource(boardId, imageObject).loadBlob(),
      ).rejects.toMatchObject({
        code: "board.media.invalid-content",
        retryable: false,
      });
    }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("Not found", { status: 404 }));
    const repository = createBoardHttpRepository({ fetch, origin });
    await expect(
      repository.resolveMediaContentSource(boardId, imageObject).loadBlob(),
    ).rejects.toMatchObject({ code: "board.http.404", retryable: false });
    expect(() =>
      repository.resolveMediaContentSource(boardId, {
        ...imageObject,
        assetId: "../traversal",
      }),
    ).toThrow(BoardHttpError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects media response content-length mismatches before reading", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array(imageBytes).buffer, {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(imageBytes.byteLength + 1),
          "X-Content-SHA256": contentSha256,
        },
      }),
    );
    const repository = createBoardHttpRepository({ fetch: request, origin });
    await expect(
      repository.resolveMediaContentSource(boardId, imageObject).loadBlob(),
    ).rejects.toMatchObject({ code: "board.media.invalid-content" });
  });

  it("stops streaming as soon as bytes exceed authoritative metadata", async () => {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(imageBytes.byteLength + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, {
        headers: {
          "Content-Type": "image/png",
          "X-Content-SHA256": contentSha256,
        },
      }),
    );
    const repository = createBoardHttpRepository({ fetch: request, origin });
    await expect(
      repository.resolveMediaContentSource(boardId, imageObject).loadBlob(),
    ).rejects.toMatchObject({ code: "board.media.invalid-content" });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(2);
  });

  it("rejects oversized upload bodies before HTTP transport", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const repository = createBoardHttpRepository({ fetch, origin });
    const oversized = new Blob([new Uint8Array(32 * 1024 * 1024 + 1)]);
    await expect(
      repository.uploadMedia({ ...uploadInput(), body: oversized }),
    ).rejects.toMatchObject({
      code: "board.media.invalid-upload",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not share source cache identities between repository security scopes", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const first = createBoardHttpRepository({ fetch, origin });
    const second = createBoardHttpRepository({ fetch, origin });
    const firstKey = first.resolveMediaContentSource(
      boardId,
      imageObject,
    ).cacheKey;
    const secondKey = second.resolveMediaContentSource(
      boardId,
      imageObject,
    ).cacheKey;
    expect(firstKey).not.toBe(secondKey);
    expect(first.resolveMediaContentSource(boardId, imageObject).cacheKey).toBe(
      firstKey,
    );
    expect(
      first.resolveMediaContentSource(documentId("board:other"), imageObject)
        .cacheKey,
    ).not.toBe(firstKey);
  });

  it("sends the latest guest access epoch for upload while leaving GET scoped by cookie", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(metadata))
      .mockResolvedValueOnce(contentResponse())
      .mockResolvedValueOnce(jsonResponse(metadata));
    const guest = {
      accessEpoch: "epoch:media-01",
      actorId: actorId("guest:media-test"),
      boardId,
      cacheScopeId: "scope:media-test",
      capabilities: [
        "board.read",
        "board.write",
        "board.snapshot.write",
      ] as const,
      csrfToken: "csrf:guest:01",
      displayName: "Ученик",
      principalType: "guest" as const,
      role: "student" as const,
      schemaVersion: "1.0" as const,
    };
    const repository = createStandaloneBoardHttpRepository(guest, {
      fetch,
      origin,
    });
    await repository.uploadMedia(uploadInput());
    const uploadHeaders = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(uploadHeaders.get("X-Board-Access-Epoch")).toBe("epoch:media-01");
    expect(uploadHeaders.get("X-CSRF-Token")).toBe("csrf:media");
    await repository.resolveMediaContentSource(boardId, imageObject).loadBlob();
    const readHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers);
    expect(readHeaders.has("X-Board-Access-Epoch")).toBe(false);

    repository.updateAccessContext({
      ...guest,
      accessEpoch: "epoch:media-02",
      csrfToken: "csrf:guest:02",
    });
    await repository.uploadMedia({
      ...uploadInput(),
      csrfToken: "csrf:guest:02",
    });
    const refreshedHeaders = new Headers(fetch.mock.calls[2]?.[1]?.headers);
    expect(refreshedHeaders.get("X-Board-Access-Epoch")).toBe("epoch:media-02");
    expect(refreshedHeaders.get("X-CSRF-Token")).toBe("csrf:guest:02");
  });
});
