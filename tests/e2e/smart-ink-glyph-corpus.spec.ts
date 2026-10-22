import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("@smoke capture a multi-stroke Greek glyph and export a versioned corpus", async ({
  page,
}) => {
  await page.goto("/tools/smart-ink-glyph-corpus-capture.html");
  await expect(page.getByRole("heading", {
    name: "Smart Ink 2.0 · Сбор рукописных символов",
  })).toBeVisible();
  await page.locator("#writer").fill("writer-test-001");
  await page.locator("#device").fill("device-test-001");
  await page.locator("#script").selectOption("Grek");
  await page.locator("#character").selectOption("α");

  const canvas = page.locator("#capture");
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) throw new Error("Missing capture canvas.");

  await page.mouse.move(rect.x + 140, rect.y + 160);
  await page.mouse.down();
  await page.mouse.move(rect.x + 170, rect.y + 210, { steps: 7 });
  await page.mouse.up();

  await page.mouse.move(rect.x + 170, rect.y + 210);
  await page.mouse.down();
  await page.mouse.move(rect.x + 200, rect.y + 160, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator("#status")).toContainText("Штрихов: 2");
  await page.getByRole("button", { name: "Добавить пример" }).click();
  await expect(page.locator("#counts")).toContainText("греческий: 1");

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспортировать JSON" }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error("Missing corpus download.");
  const exported = JSON.parse(await readFile(path, "utf8"));
  expect(exported.schemaVersion).toBe("tutorboard.smart-ink-glyph-corpus/1");
  expect(exported.samples).toHaveLength(1);
  expect(exported.samples[0]).toMatchObject({
    target: { kind: "glyph", script: "Grek", character: "α" },
    labelStatus: "unreviewed",
    writerId: "writer-test-001",
    deviceId: "device-test-001",
    provenance: "captured",
  });
  expect(exported.samples[0].strokes).toHaveLength(2);
});

test("@smoke cancels an unfinished stroke without adding a sample", async ({
  page,
}) => {
  await page.goto("/tools/smart-ink-glyph-corpus-capture.html");
  const rect = await page.locator("#capture").boundingBox();
  if (!rect) throw new Error("Missing capture canvas.");
  await page.mouse.move(rect.x + 100, rect.y + 100);
  await page.mouse.down();
  await page.mouse.move(rect.x + 180, rect.y + 200);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Добавить пример" })).toBeDisabled();
  await expect(page.locator("#counts")).toContainText("Собрано: 0");
});
