/// <reference lib="dom" />

/* eslint-disable @typescript-eslint/prefer-promise-reject-errors -- IndexedDB failures originate as DOMException values in Playwright's browser context. */

import { expect, test } from "@playwright/test";

const databaseName = "tutorboard-local-v1";

async function corruptCurrentRevision(page: import("@playwright/test").Page) {
  await page.evaluate(async (name) => {
    const request = indexedDB.open(name);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("revisions", "readwrite");
      const store = transaction.objectStore("revisions");
      const revisions = await new Promise<Array<Record<string, unknown>>>(
        (resolve, reject) => {
          const all = store.getAll();
          all.onsuccess = () =>
            resolve(all.result as Array<Record<string, unknown>>);
          all.onerror = () => reject(all.error);
        },
      );
      const latest = revisions.sort(
        (left, right) => Number(right.sequence) - Number(left.sequence),
      )[0];
      if (latest === undefined) {
        throw new Error("No local revision exists.");
      }
      store.put({ ...latest, serializedDocument: "{" });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, databaseName);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
});

test("autosaves drawing state and restores it after reload", async ({
  page,
}) => {
  await page.keyboard.press("r");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  await page.mouse.move(bounds.x + 620, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 730, bounds.y + 260, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Ожидает сохранения",
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );

  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
});

test("falls back to the last good revision and keeps a recovery notice", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Настройки доски" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки доски" });
  await settings.getByRole("button", { name: "Центрировать доску" }).click();
  await settings
    .getByRole("button", { name: "Закрыть настройки доски" })
    .click();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Ожидает сохранения",
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  await corruptCurrentRevision(page);

  await page.reload();
  await expect(
    page.getByText(/Открыта последняя корректная версия/),
  ).toBeVisible();
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
});
