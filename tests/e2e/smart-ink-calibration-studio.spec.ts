import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function stroke(page: import("@playwright/test").Page, fromX: number, fromY: number, toX: number, toY: number) {
  const canvas = page.locator("#capture");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Studio capture canvas unavailable.");
  await page.mouse.move(bounds.x + fromX, bounds.y + fromY);
  await page.mouse.down();
  await page.mouse.move(bounds.x + toX, bounds.y + toY, { steps: 8 });
  await page.mouse.up();
}

test("@smoke Calibration Studio records shapes and multi-stroke Cyrillic glyphs with dual exports", async ({ page }) => {
  await page.goto("/tools/smart-ink-calibration-studio.html");
  await expect(page.getByRole("heading", { name: "Calibration Studio" })).toBeVisible();
  await page.locator("#writer").fill("writer-studio-01");
  await page.locator("#device").fill("device-studio-01");
  await page.locator("#script").selectOption("shape");
  await page.locator("#character").selectOption("triangle");
  await stroke(page, 100, 100, 180, 190);
  await page.getByRole("button", { name: "Добавить пример" }).click();
  await expect(page.locator("#counts")).toContainText("фигуры: 1");

  await page.locator("#script").selectOption("Cyrl");
  await page.locator("#character").selectOption("Ж");
  await stroke(page, 120, 100, 120, 190);
  await stroke(page, 100, 120, 170, 180);
  await page.getByRole("button", { name: "Добавить пример" }).click();
  await expect(page.locator("#counts")).toContainText("кириллица: 1");

  const downloadCommon = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт общего JSON" }).click();
  const commonFile = await (await downloadCommon).path();
  if (!commonFile) throw new Error("Missing common corpus JSON.");
  const common: unknown = JSON.parse(await readFile(commonFile, "utf8"));
  expect(common).toMatchObject({
    schemaVersion: "tutorboard.smart-ink-glyph-corpus/1",
    samples: [
      { target: { kind: "shape", shape: "triangle" }, labelStatus: "unreviewed" },
      { target: { kind: "glyph", script: "Cyrl", character: "Ж" }, labelStatus: "unreviewed" },
    ],
  });
  expect(common).toHaveProperty("samples.1.strokes.1.points");

  const downloadGeometry = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт геометрии" }).click();
  const geometryFile = await (await downloadGeometry).path();
  if (!geometryFile) throw new Error("Missing geometry JSON.");
  const geometry: unknown = JSON.parse(await readFile(geometryFile, "utf8"));
  expect(geometry).toMatchObject({
    schemaVersion: "tutorboard.smart-ink-corpus/0.1",
    samples: [{ expectedKind: "triangle", shouldPropose: true }],
  });
});

test("@smoke Calibration Studio saves locally, restores, previews, relabels and diagnoses", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/tools/smart-ink-calibration-studio.html");
  await page.locator("#script").selectOption("Latn");
  await page.locator("#character").selectOption("A");
  await stroke(page, 120, 100, 150, 190);
  await page.getByRole("button", { name: "Добавить пример" }).click();
  await expect(page.locator("#counts")).toContainText("латиница: 1");
  await page.getByRole("button", { name: "Сохранить локально" }).click();
  await expect(page.getByRole("status")).toContainText("Локальная копия сохранена");
  await page.reload();
  await expect(page.locator("#counts")).toContainText("Всего: 0");
  await page.getByRole("button", { name: "Загрузить локально" }).click();
  await expect(page.locator("#counts")).toContainText("Всего: 1");
  await page.getByRole("button", { name: "Проверить выбранный образец" }).click();
  await expect(page.locator("#evaluation")).toContainText("ЗАПРЕЩЕНО");
  await page.locator("#script").selectOption("shape");
  await page.locator("#character").selectOption("line");
  await page.getByRole("button", { name: "Исправить метку на выбранную выше" }).click();
  await expect(page.locator("#saved-samples")).toContainText("Линия");
  await page.getByRole("button", { name: "Удалить образец" }).click();
  await expect(page.locator("#counts")).toContainText("Всего: 0");
  await page.getByRole("button", { name: "Удалить локальную копию" }).click();
  await expect(page.getByRole("status")).toContainText("Локальная копия удалена");
});

test("@smoke Calibration Studio imports legacy geometry JSON and rejects repeat import", async ({ page }) => {
  await page.goto("/tools/smart-ink-calibration-studio.html");
  const legacy = {
    schemaVersion: "tutorboard.smart-ink-corpus/0.1",
    samples: [{
      id: "captured-circle-demo-123456789",
      expectedKind: "circle",
      metadata: { browser: "chromium", deviceProfile: "windows-desktop", pointerType: "pen", durationMs: 120 },
      points: [{ x: 25, y: 25 }, { x: 35, y: 45 }, { x: 45, y: 25 }],
    }],
  };
  const content = Buffer.from(JSON.stringify(legacy));
  await page.locator("#file-import").setInputFiles({
    name: "legacy.json", mimeType: "application/json", buffer: content,
  });
  await expect(page.locator("#counts")).toContainText("фигуры: 1");
  await page.locator("#file-import").setInputFiles({
    name: "legacy.json", mimeType: "application/json", buffer: content,
  });
  await expect(page.getByRole("status")).toContainText("Ошибка импорта");
  await expect(page.locator("#counts")).toContainText("Всего: 1");
});
