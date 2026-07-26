import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("exports deterministic document and diagnostic snapshots", async ({
  page,
}) => {
  await page.goto("/");

  const jsonDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const jsonDownload = await jsonDownloadPromise;
  expect(jsonDownload.suggestedFilename()).toMatch(/\.tutorboard\.json$/u);
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).not.toBeNull();
  const exported = JSON.parse(await readFile(jsonPath, "utf8")) as {
    schemaVersion?: unknown;
  };
  expect(exported.schemaVersion).toBe("1.0");

  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Снимок SVG" }).click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toBe("tutorboard-snapshot.svg");
  const svgPath = await svgDownload.path();
  expect(svgPath).not.toBeNull();
  expect(await readFile(svgPath, "utf8")).toContain(
    '<svg xmlns="http://www.w3.org/2000/svg"',
  );

  const pngDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Снимок PNG" }).click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toBe("tutorboard-snapshot.png");
  const pngPath = await pngDownload.path();
  expect(pngPath).not.toBeNull();
  const png = await readFile(pngPath);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});
