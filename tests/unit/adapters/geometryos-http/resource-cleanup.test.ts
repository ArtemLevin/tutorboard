import { describe, expect, it } from "vitest";

import { readBoundedResponseBody } from "../../../../src/adapters/geometryos-http/body-reader";
import { createGeometryOsHttpClient } from "../../../../src/adapters/geometryos-http/public";
import { geometryOsRequestId } from "../../../../src/core/public";

function cancellableStream(onCancel: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull() {
      // Keep the response pending until the consumer explicitly discards it.
    },
    cancel() {
      onCancel();
    },
  });
}

describe("GeometryOS response resource cleanup", () => {
  it("cancels an uncorrelated response body", async () => {
    const requestId = geometryOsRequestId("tutorboard-expected-request");
    let cancelCount = 0;
    const fetchImplementation: typeof globalThis.fetch = () =>
      Promise.resolve(
        new Response(cancellableStream(() => (cancelCount += 1)), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": "tutorboard-unexpected-request",
          },
        }),
      );
    const client = createGeometryOsHttpClient({
      baseUrl: "https://geometry.example.test",
      createRequestId: () => requestId,
      fetch: fetchImplementation,
      generateTimeoutMs: 1000,
    });

    await expect(
      client.startGenerate({ prompt: "Построй треугольник ABC" }).result,
    ).resolves.toMatchObject({
      kind: "incompatible-contract",
      code: "geometryos.request-id-mismatch",
    });
    expect(cancelCount).toBe(1);
  });

  it("cancels a body rejected by declared length before reading", async () => {
    let cancelCount = 0;
    const response = new Response(cancellableStream(() => (cancelCount += 1)), {
      status: 200,
      headers: {
        "Content-Length": "1024",
      },
    });

    await expect(readBoundedResponseBody(response, 16)).resolves.toEqual({
      status: "too-large",
    });
    expect(cancelCount).toBe(1);
  });
});
