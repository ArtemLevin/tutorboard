// @vitest-environment node

import { once } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  mathInkProxyResultSchemaVersion,
} from "../../services/math-ink-proxy/contract.mjs";
import {
  createMathInkProxyHttpServer,
} from "../../services/math-ink-proxy/server.mjs";

function recognitionRequest() {
  return {
    normalization: { originX: 0, originY: 0, scale: 100 },
    normalizedHeight: 1,
    normalizedWidth: 1,
    recognitionId: "recognition:forwarded",
    schemaVersion: "tutorboard.math-ink-request/0.1",
    sessionId: "session:forwarded",
    sourceBounds: {
      height: 100,
      maxX: 100,
      maxY: 100,
      minX: 0,
      minY: 0,
      width: 100,
    },
    strokes: [
      {
        id: "stroke:forwarded",
        points: [
          { timeMs: 0, x: 0, y: 0 },
          { timeMs: 10, x: 1, y: 1 },
        ],
      },
    ],
  };
}

describe("math ink proxy forwarding boundary", () => {
  it("uses the trusted proxy hop as the rate-limit client key", async () => {
    const recognize = vi.fn(async ({ requestId }) => ({
      body: {
        candidates: [],
        diagnostics: [],
        provider: "mathpix",
        providerRequestId: null,
        providerVersion: "test",
        requestId,
        schemaVersion: mathInkProxyResultSchemaVersion,
        status: "unrecognized",
      },
      status: 200,
    }));
    const server = createMathInkProxyHttpServer({
      configured: true,
      service: { recognize },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Test server has no TCP address.");
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/v1/recognize`,
        {
          body: JSON.stringify(recognitionRequest()),
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "198.51.100.9, 203.0.113.7",
            "X-TutorBoard-Request-Id": "recognition:forwarded",
          },
          method: "POST",
        },
      );
      expect(response.status).toBe(200);
      expect(recognize).toHaveBeenCalledWith(
        expect.objectContaining({ clientKey: "203.0.113.7" }),
      );
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
