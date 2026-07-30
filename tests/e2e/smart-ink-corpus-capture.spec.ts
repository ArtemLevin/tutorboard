import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const captureHtml = await readFile(
  path.resolve("tools/smart-ink-corpus-capture.html"),
  "utf8",
);

test.beforeEach(async ({ page }) => {
  await page.setContent(captureHtml);
  await expect(
    page.getByRole("heading", { name: "Smart Ink corpus capture" }),
  ).toBeVisible();
});

test("captures one stroke and exports the versioned corpus", async ({
  page,
}) => {
  const canvas = page.locator("#capture");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Capture canvas has no bounds.");
  }

  await page.mouse.move(bounds.x + 80, bounds.y + 120);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 520, bounds.y + 150, { steps: 12 });
  await page.mouse.up();

  const add = page.getByRole("button", { name: "Добавить пример" });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.locator("#counts")).toContainText("Всего: 1");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспортировать JSON" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) {
    throw new Error("Corpus download has no local path.");
  }
  const corpus = JSON.parse(await readFile(downloadPath, "utf8")) as {
    samples: {
      expectedKind: string;
      metadata: { pointerType: string };
      points: unknown[];
      provenance: string;
    }[];
    schemaVersion: string;
  };

  expect(corpus.schemaVersion).toBe("tutorboard.smart-ink-corpus/0.1");
  expect(corpus.samples).toHaveLength(1);
  expect(corpus.samples[0]).toMatchObject({
    expectedKind: "line",
    metadata: { pointerType: "mouse" },
    provenance: "captured",
  });
  expect(corpus.samples[0]?.points.length).toBeGreaterThan(2);
});

test("discards a partial stroke on Escape", async ({ page }) => {
  const canvas = page.locator("#capture");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Capture canvas has no bounds.");
  }

  await page.mouse.move(bounds.x + 100, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 260, bounds.y + 180, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(
    page.getByRole("button", { name: "Добавить пример" }),
  ).toBeDisabled();
  await expect(page.locator("#counts")).toContainText("Всего: 0");
  await expect(page.getByRole("status")).toHaveText("Штрих отменён.");
});
