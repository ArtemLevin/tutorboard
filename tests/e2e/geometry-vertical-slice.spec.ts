/// <reference lib="dom" />

/* eslint-disable @typescript-eslint/prefer-promise-reject-errors -- IndexedDB failures originate as DOMException values in Playwright's browser context. */

import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const fixtureRoot = path.resolve("contracts/geometryos/fixtures");
const generateSuccess = JSON.parse(
  fs.readFileSync(
    path.join(fixtureRoot, "generate-success.response.json"),
    "utf8",
  ),
) as unknown;
const layoutSuccess = JSON.parse(
  fs.readFileSync(
    path.join(fixtureRoot, "layout-success.response.json"),
    "utf8",
  ),
) as unknown;
const databaseName = "tutorboard-local-v1";

async function latestImportTranslation(page: import("@playwright/test").Page) {
  return page.evaluate(async (name) => {
    const request = indexedDB.open(name);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("revisions", "readonly");
      const revisions = await new Promise<Array<Record<string, unknown>>>(
        (resolve, reject) => {
          const all = transaction.objectStore("revisions").getAll();
          all.onsuccess = () =>
            resolve(all.result as Array<Record<string, unknown>>);
          all.onerror = () => reject(all.error);
        },
      );
      const latest = revisions.sort(
        (left, right) => Number(right.sequence) - Number(left.sequence),
      )[0];
      if (latest === undefined) {
        throw new Error("No TutorBoard revision exists.");
      }
      const serialized = latest.serializedDocument;
      if (typeof serialized !== "string") {
        throw new TypeError("TutorBoard revision is not serialized.");
      }
      const document = JSON.parse(serialized) as {
        geometryImports: Record<
          string,
          { visualTransform: { translation: { x: number; y: number } } }
        >;
      };
      const imported = Object.values(document.geometryImports)[0];
      if (imported === undefined) {
        throw new Error("Geometry import is missing from persisted document.");
      }
      return imported.visualTransform.translation;
    } finally {
      database.close();
    }
  }, databaseName);
}

test("imports the triangle-altitude fixture atomically and restores it", async ({
  page,
}) => {
  await page.route("http://localhost:8000/**", async (route) => {
    const request = route.request();
    const origin = request.headers().origin ?? "http://127.0.0.1:4173";
    const corsHeaders = {
      "Access-Control-Allow-Headers": "content-type,x-request-id",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Expose-Headers": "x-request-id",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 200 });
      return;
    }
    const requestId = request.headers()["x-request-id"];
    if (requestId === undefined) {
      throw new Error("GeometryOS request ID is missing.");
    }
    const pathname = new URL(request.url()).pathname;
    const body =
      pathname === "/ready"
        ? {
            checks: [
              { name: "lifecycle", status: "pass" },
              { name: "executor", status: "pass" },
            ],
            status: "ready",
          }
        : pathname === "/api/v1/generate"
          ? generateSuccess
          : layoutSuccess;
    await route.fulfill({
      body: JSON.stringify(body),
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
      status: 200,
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );

  await page.getByRole("button", { name: "Построить" }).click();

  await expect(page.getByTestId("geometry-prompt-status")).toContainText(
    "Построение добавлено: 12 объектов",
  );
  await expect(page.getByTestId("object-count")).toHaveText("16 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("12 выбрано");
  await expect(page.getByTestId("geometry-import-count")).toHaveText(
    "1 построений",
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  const placementBeforeReload = await latestImportTranslation(page);

  await page.reload();

  await expect(page.getByTestId("object-count")).toHaveText("16 объекта");
  await expect(page.getByTestId("geometry-import-count")).toHaveText(
    "1 построений",
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  expect(await latestImportTranslation(page)).toEqual(placementBeforeReload);
});
