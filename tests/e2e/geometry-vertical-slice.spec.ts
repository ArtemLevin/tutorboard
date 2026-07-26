/// <reference lib="dom" />

/* eslint-disable @typescript-eslint/prefer-promise-reject-errors -- IndexedDB failures originate as DOMException values in Playwright's browser context. */

import { expect, test } from "@playwright/test";

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
  const geometryNetworkTrace: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("geometryos")) {
      geometryNetworkTrace.push(`request ${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("geometryos")) {
      geometryNetworkTrace.push(
        `response ${response.status()} ${response.url()}`,
      );
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("geometryos")) {
      geometryNetworkTrace.push(
        `failed ${request.failure()?.errorText ?? "unknown"} ${request.url()}`,
      );
    }
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

  const geometryStatus = page.getByTestId("geometry-prompt-status");
  await expect
    .poll(
      async () => {
        const status = (await geometryStatus.textContent()) ?? "";
        return status.includes("geometryos.network-failure")
          ? `${status}; ${geometryNetworkTrace.join("; ")}`
          : status;
      },
      { timeout: 5_000 },
    )
    .toContain("Построение добавлено: 12 объектов");
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
