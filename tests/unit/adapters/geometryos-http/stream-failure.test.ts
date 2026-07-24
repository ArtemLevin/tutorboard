import { describe, expect, it } from "vitest";

import { createGeometryOsHttpClient } from "../../../../src/adapters/geometryos-http/public";
import { geometryOsRequestId } from "../../../../src/core/public";

const requestId = geometryOsRequestId("tutorboard-stream-failure");

describe("GeometryOS response streaming", () => {
  it("normalizes a response stream failure instead of rejecting the task", async () => {
    const failedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new TypeError("response stream failed"));
      },
    });
    const fetchImplementation: typeof globalThis.fetch = () =>
      Promise.resolve(
        new Response(failedBody, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
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
    ).resolves.toEqual({
      kind: "transport-failure",
      requestId,
      code: "geometryos.network-failure",
      retryable: true,
    });
  });
});
