import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("shows and exports Smart Ink recognition diagnostics", async ({
  page,
}) => {
  await page.goto("/");
  const diagnostics = page.getByRole("complementary", {
    name: "Диагностика Smart Ink",
  });
  await expect(diagnostics).toBeVisible();
  await expect(
    diagnostics.getByRole("button", {
      name: "Экспортировать последний жест",
    }),
  ).toBeDisabled();

  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }

  await page.getByRole("button", { name: "Smart Ink (I)" }).click();
  const center = {
    x: bounds.x + bounds.width * 0.52,
    y: bounds.y + bounds.height * 0.42,
  };
  const radius = 58;
  await page.mouse.move(center.x + radius, center.y);
  await page.mouse.down();
  for (let index = 1; index <= 48; index += 1) {
    const angle = (index / 48) * Math.PI * 2;
    await page.mouse.move(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
    );
  }
  await page.mouse.up();

  await expect(diagnostics.getByText("Распознано")).toBeVisible();
  await expect(diagnostics.getByText("circle", { exact: true })).toBeVisible();
  await expect(diagnostics.getByText(/mouse · \d+ ms/iu)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await diagnostics
    .getByRole("button", { name: "Экспортировать последний жест" })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  if (path === null) {
    throw new Error("Smart Ink diagnostic download has no local path.");
  }
  const exported = JSON.parse(await readFile(path, "utf8")) as {
    captureDiagnostics: {
      labelStatus: string;
      selectedCandidateKind: string;
    };
    samples: readonly {
      metadata: { browser: string; pointerType: string };
    }[];
    schemaVersion: string;
  };

  expect(exported.schemaVersion).toBe("tutorboard.smart-ink-corpus/0.1");
  expect(exported.captureDiagnostics).toMatchObject({
    labelStatus: "unreviewed",
    selectedCandidateKind: "circle",
  });
  expect(exported.samples[0]?.metadata).toMatchObject({
    browser: "chromium",
    pointerType: "mouse",
  });
});
