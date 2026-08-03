// @vitest-environment node

import { once } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { formulaRecognitionResultSchemaVersion } from "../../services/math-ink-proxy/contract.mjs";
import { createFormulaRecognitionGatewayHttpServer } from "../../services/math-ink-proxy/server.mjs";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3wAAAABJRU5ErkJggg==";

function recognitionRequest() {
  return {
    image: { data: png, height: 128, mimeType: "image/png", width: 256 },
    provider: "paddleocr",
    recognitionId: "recognition:forwarded",
    schemaVersion: "tutorboard.formula-recognition-request/1",
    sessionId: "session:forwarded",
    source: {
      normalizedHeight: 0.5,
      normalizedWidth: 1,
      pointCount: 2,
      strokeCount: 1,
    },
  };
}

describe("formula recognition gateway forwarding boundary", () => {
  it("uses the trusted proxy hop as the rate-limit client key", async () => {
    const recognize = vi.fn(async ({ requestId }) => ({
      body: {
        candidates: [],
        diagnostics: [],
        provider: "paddleocr",
        providerRequestId: null,
        providerVersion: "test",
        requestId,
        schemaVersion: formulaRecognitionResultSchemaVersion,
        status: "unrecognized",
      },
      status: 200,
    }));
    const server = createFormulaRecognitionGatewayHttpServer({
      service: {
        configuredProviders: {
          "local-ocr-llm": false,
          paddleocr: true,
          "yandex-ai-studio": false,
        },
        recognize,
      },
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
