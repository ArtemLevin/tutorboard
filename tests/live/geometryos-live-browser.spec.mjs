import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const request = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "contracts/geometryos/fixtures/generate-success.request.json",
    ),
    "utf8",
  ),
);
const baseUrl = process.env.GEOMETRYOS_BASE_URL ?? "http://127.0.0.1:18000";
const requestId = "tutorboard-live-browser-contract";

test("browser can validate a pinned GeometryOS response", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate(
    async ({ geometryOsBaseUrl, correlationId, fixture }) => {
      try {
        const validators =
          await import("/src/adapters/geometryos-http/generated/geometryos.validators.mjs");
        if (typeof validators.validateGenerateResponse !== "function") {
          return { ok: false, code: "validator-export-missing" };
        }

        const response = await fetch(
          new URL("/api/v1/generate", geometryOsBaseUrl),
          {
            method: "POST",
            credentials: "omit",
            headers: {
              "Content-Type": "application/json",
              "X-Request-ID": correlationId,
            },
            body: JSON.stringify(fixture),
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (response.status !== 200) {
          return {
            ok: false,
            code: "unexpected-status",
            status: response.status,
          };
        }

        const visibleRequestId = response.headers.get("x-request-id");
        if (visibleRequestId !== correlationId) {
          return {
            ok: false,
            code: "request-id-not-browser-visible",
            status: response.status,
          };
        }

        const contentType = response.headers.get("content-type")?.toLowerCase();
        if (!contentType?.startsWith("application/json")) {
          return {
            ok: false,
            code: "unexpected-content-type",
            status: response.status,
          };
        }

        let payload;
        try {
          payload = await response.json();
        } catch {
          return {
            ok: false,
            code: "invalid-json",
            status: response.status,
          };
        }

        if (!validators.validateGenerateResponse(payload)) {
          const diagnostics = (validators.validateGenerateResponse.errors ?? [])
            .slice(0, 10)
            .map((error) => ({
              instancePath: error.instancePath,
              keyword: error.keyword,
              schemaPath: error.schemaPath,
            }));
          return {
            ok: false,
            code: "runtime-validation-failed",
            status: response.status,
            diagnostics,
          };
        }

        if (
          payload.status !== "success" ||
          payload.schema_version !== "0.2.0"
        ) {
          return {
            ok: false,
            code: "incompatible-success-contract",
            status: response.status,
          };
        }

        return {
          ok: true,
          status: response.status,
          requestId: visibleRequestId,
          outcome: payload.status,
          schemaVersion: payload.schema_version,
        };
      } catch (error) {
        return {
          ok: false,
          code: "browser-execution-failed",
          errorName: error instanceof Error ? error.name : "UnknownError",
        };
      }
    },
    {
      geometryOsBaseUrl: baseUrl,
      correlationId: requestId,
      fixture: request,
    },
  );

  expect(result).toEqual({
    ok: true,
    status: 200,
    requestId,
    outcome: "success",
    schemaVersion: "0.2.0",
  });
});
