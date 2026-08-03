// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { formulaRecognitionRequestSchemaVersion } from "../../services/math-ink-proxy/contract.mjs";
import { createFormulaRecognitionGatewayService } from "../../services/math-ink-proxy/service.mjs";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3wAAAABJRU5ErkJggg==";

function request() {
  return {
    image: { data: png, height: 144, mimeType: "image/png", width: 320 },
    provider: "paddleocr",
    recognitionId: "recognition:upstream",
    schemaVersion: formulaRecognitionRequestSchemaVersion,
    sessionId: "session:upstream",
    source: {
      normalizedHeight: 0.4,
      normalizedWidth: 1,
      pointCount: 4,
      strokeCount: 2,
    },
  };
}

describe("Paddle upstream request correlation", () => {
  it("forwards the TutorBoard request identifier to the sidecar", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            latex: "x+1",
            modelVersion: "PP-FormulaNet-S",
            requestId: "recognition:upstream",
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
    );
    const service = createFormulaRecognitionGatewayService({
      fetch,
      logger: vi.fn(),
      providers: {
        paddleocr: {
          allowInsecure: true,
          apiUrl: "http://paddle.test/v1/recognize",
          token: "sidecar-token",
        },
      },
      sleep: vi.fn(async () => undefined),
    });

    const result = await service.recognize({
      clientKey: "client:request-id",
      request: request(),
      requestId: "recognition:upstream",
      signal: new AbortController().signal,
    });

    expect(result.status).toBe(200);
    const [, init] = fetch.mock.calls[0];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sidecar-token",
      "X-TutorBoard-Request-Id": "recognition:upstream",
    });
  });
});
