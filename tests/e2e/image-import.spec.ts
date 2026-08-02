import { expect, test } from "@playwright/test";
import {
  rightDoubleClickAt,
  stageCenter,
} from "./coordinate-plot-interaction.js";

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8WQAAAAASUVORK5CYII=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
});

test("imports a local image and transforms it", async ({ page }) => {
  const chooser = page.getByLabel("Вставить изображения");
  await chooser.setInputFiles({
    buffer: png1x1,
    mimeType: "image/png",
    name: "pixel.png",
  });

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
  await expect(page.getByTestId("board-stage")).toHaveAttribute(
    "data-transformable-count",
    "1",
  );
  await rightDoubleClickAt(page, await stageCenter(page));
  await page
    .getByRole("button", { name: "Увеличить выделение на 10%" })
    .click();
  await page
    .getByRole("button", { name: "Повернуть выделение на 15 градусов" })
    .click();
  await expect(page.getByTestId("first-object-transform")).toHaveText(
    "Масштаб: 1.1, 1.1 · Поворот: 15°",
  );
});

test("pastes an image file from the system clipboard event", async ({
  page,
}) => {
  const base64 = png1x1.toString("base64");
  await page.evaluate((encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (value) =>
      value.charCodeAt(0),
    );
    const file = new File([bytes], "clipboard.png", {
      type: "image/png",
    });
    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            getAsFile: () => file,
            kind: "file",
            type: file.type,
          },
        ],
      },
    });
    window.dispatchEvent(pasteEvent);
  }, base64);

  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect(page.getByText("Вставлено изображений: 1")).toBeVisible();
  await expect(page.getByTestId("selection-count")).toHaveText("1 выбрано");
});
