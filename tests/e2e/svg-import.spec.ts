/// <reference lib="dom" />

/* eslint-disable @typescript-eslint/prefer-promise-reject-errors -- IndexedDB failures originate as DOMException values in Playwright's browser context. */

import { Buffer } from "node:buffer";

import { expect, test } from "@playwright/test";

const safeSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><rect width="160" height="80" fill="#335577"/><text x="20" y="48">SVG</text></svg>';

async function storedEmbeddedSvgExists(page: import("@playwright/test").Page) {
  return await page.evaluate(async () => {
    const request = indexedDB.open("tutorboard-local-v1");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("revisions", "readonly");
      const store = transaction.objectStore("revisions");
      const revisions = await new Promise<Array<Record<string, unknown>>>(
        (resolve, reject) => {
          const all = store.getAll();
          all.onsuccess = () =>
            resolve(all.result as Array<Record<string, unknown>>);
          all.onerror = () => reject(all.error);
        },
      );
      return revisions.some((revision) => {
        if (typeof revision.serializedDocument !== "string") {
          return false;
        }
        const document = JSON.parse(revision.serializedDocument) as {
          objects: Record<string, Record<string, unknown>>;
        };
        return Object.values(document.objects).some(
          (object) =>
            object.kind === "image.embedded" &&
            object.mimeType === "image/svg+xml",
        );
      });
    } finally {
      database.close();
    }
  });
}

async function tamperStoredEmbeddedSvg(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const request = indexedDB.open("tutorboard-local-v1");
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
      if (
        latest === undefined ||
        typeof latest.serializedDocument !== "string"
      ) {
        throw new Error("No local revision exists.");
      }
      const document = JSON.parse(latest.serializedDocument) as {
        objects: Record<string, Record<string, unknown>>;
      };
      const svg = Object.values(document.objects).find(
        (object) =>
          object.kind === "image.embedded" &&
          object.mimeType === "image/svg+xml",
      );
      if (svg === undefined || typeof svg.dataUrl !== "string") {
        throw new Error("No stored embedded SVG exists.");
      }
      svg.dataUrl =
        "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==";
      store.put({ ...latest, serializedDocument: JSON.stringify(document) });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
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

test("inserts, selects and restores one safe embedded SVG", async ({
  page,
}) => {
  await page.getByLabel("Вставить изображения").setInputFiles({
    buffer: Buffer.from(safeSvg),
    mimeType: "image/svg+xml",
    name: "safe.svg",
  });

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-transformable-count",
    "1",
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );

  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
});

test("rejects executable SVG without mutating the document", async ({
  page,
}) => {
  await page.getByLabel("Вставить изображения").setInputFiles({
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    ),
    mimeType: "image/svg+xml",
    name: "unsafe.svg",
  });

  await expect(page.getByRole("alert")).toContainText(
    "Изображение не вставлено",
  );
  await expect(page.getByTestId("object-count")).toHaveText("0 объекта");
});

test("opens recovery UI for a tampered stored embedded SVG", async ({
  page,
}) => {
  await page.getByLabel("Вставить изображения").setInputFiles({
    buffer: Buffer.from(safeSvg),
    mimeType: "image/svg+xml",
    name: "safe.svg",
  });
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect
    .poll(() => storedEmbeddedSvgExists(page), {
      message: "Wait for the embedded SVG revision to reach IndexedDB.",
    })
    .toBe(true);
  await tamperStoredEmbeddedSvg(page);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Требуется восстановление доски" }),
  ).toBeVisible();
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toHaveCount(0);
});
