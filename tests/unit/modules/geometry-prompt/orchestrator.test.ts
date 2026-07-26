import { describe, expect, it, vi } from "vitest";

import generateSuccessJson from "../../../../contracts/geometryos/fixtures/generate-success.response.json?raw";
import generateAmbiguityJson from "../../../../contracts/geometryos/fixtures/generate-ambiguity.response.json?raw";
import generateUnsupportedJson from "../../../../contracts/geometryos/fixtures/generate-unsupported.response.json?raw";
import layoutSuccessJson from "../../../../contracts/geometryos/fixtures/layout-success.response.json?raw";
import { createGeometryOsHttpClient } from "../../../../src/adapters/geometryos-http/public";
import { actorId, geometryOsRequestId } from "../../../../src/core/public";
import { startGeometryPrompt } from "../../../../src/modules/geometry-prompt/public";
import type { GeometryPromptStage } from "../../../../src/modules/geometry-prompt/public";

const generateSuccess = JSON.parse(generateSuccessJson) as unknown;
const generateAmbiguity = JSON.parse(generateAmbiguityJson) as unknown;
const generateUnsupported = JSON.parse(generateUnsupportedJson) as unknown;
const layoutSuccess = JSON.parse(layoutSuccessJson) as unknown;

function correlatedResponse(
  body: unknown,
  init: RequestInit | undefined,
  status = 200,
): Response {
  const requestId = new Headers(init?.headers).get("X-Request-ID");
  if (requestId === null) {
    throw new Error("Expected a correlated GeometryOS request.");
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    },
  });
}

function workflowClient(fetchImplementation: typeof globalThis.fetch) {
  let sequence = 0;
  return createGeometryOsHttpClient({
    baseUrl: "https://geometry.example.test",
    createRequestId: () =>
      geometryOsRequestId(`tutorboard-workflow-${++sequence}`),
    fetch: fetchImplementation,
  });
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

describe("Geometry prompt orchestration", () => {
  it("runs readiness, generate and layout before producing one centered import", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn<typeof globalThis.fetch>((input, init) => {
      const url = requestUrl(input);
      calls.push(new URL(url).pathname);
      if (url.endsWith("/ready")) {
        return Promise.resolve(
          correlatedResponse(
            {
              checks: [
                { name: "lifecycle", status: "pass" },
                { name: "executor", status: "pass" },
              ],
              status: "ready",
            },
            init,
          ),
        );
      }
      return Promise.resolve(
        correlatedResponse(
          url.endsWith("/generate") ? generateSuccess : layoutSuccess,
          init,
        ),
      );
    });
    const progress: GeometryPromptStage[] = [];
    const operation = startGeometryPrompt({
      actorId: actorId("actor:test"),
      client: workflowClient(fetchMock),
      createToken: () => "vertical-slice",
      now: () => "2026-07-26T12:00:00.000Z",
      onProgress: (item) => progress.push(item.stage),
      prompt: "Построй треугольник ABC и высоту AH",
      targetWorldCenter: { x: 500, y: 400 },
    });

    const result = await operation.result;

    expect(calls).toEqual(["/ready", "/api/v1/generate", "/api/v1/layout"]);
    expect(progress).toEqual(["readiness", "generate", "layout", "import"]);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.requestIds).toHaveLength(3);
    expect(result.command.kind).toBe("core.geometry.import");
    expect(result.command.objects).toHaveLength(12);
    expect(result.command.importRecord.visualTransform.translation).toEqual({
      x: 360,
      y: 290,
    });
  });

  it("stops before generation when readiness is not ready", async () => {
    const fetchMock: typeof globalThis.fetch = (_input, init) =>
      Promise.resolve(
        correlatedResponse(
          {
            checks: [{ name: "executor", status: "fail" }],
            status: "not_ready",
          },
          init,
          503,
        ),
      );
    const result = await startGeometryPrompt({
      actorId: actorId("actor:test"),
      client: workflowClient(fetchMock),
      createToken: () => "not-ready",
      now: () => "2026-07-26T12:00:00.000Z",
      prompt: "Построй треугольник",
      targetWorldCenter: { x: 0, y: 0 },
    }).result;

    expect(result).toMatchObject({
      kind: "failure",
      code: "geometryos.not-ready",
      retryable: true,
      stage: "readiness",
    });
  });

  it.each([
    ["needs-clarification", generateAmbiguity],
    ["domain-error", generateUnsupported],
  ] as const)(
    "keeps the %s generate outcome out of layout",
    async (kind, body) => {
      let calls = 0;
      const fetchMock: typeof globalThis.fetch = (input, init) => {
        calls += 1;
        return Promise.resolve(
          correlatedResponse(
            requestUrl(input).endsWith("/ready")
              ? {
                  checks: [{ name: "executor", status: "pass" }],
                  status: "ready",
                }
              : body,
            init,
          ),
        );
      };
      const result = await startGeometryPrompt({
        actorId: actorId("actor:test"),
        client: workflowClient(fetchMock),
        createToken: () => "domain-outcome",
        now: () => "2026-07-26T12:00:00.000Z",
        prompt: "Построй фигуру",
        targetWorldCenter: { x: 0, y: 0 },
      }).result;

      expect(result.kind).toBe(kind);
      expect(calls).toBe(2);
    },
  );
});
