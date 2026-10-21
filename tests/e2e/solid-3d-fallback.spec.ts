import { expect, test } from "@playwright/test";

/** WebGL-unavailable is a supported browser capability state. */
test("retains numeric 3D editing controls when the browser cannot create WebGL", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (
          kind === "webgl" ||
          kind === "webgl2" ||
          kind === "experimental-webgl"
        ) return null;
        return Reflect.apply(original, this, [kind, ...args]);
      },
    });
  });
  await page.goto("/");
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Board stage missing");
  await page.getByRole("button", { name: "ИИ-инструменты" }).click();
  await page.getByRole("menuitemradio", { name: "Построение по тексту" }).click();
  await page.getByLabel("Текст построения").fill("куб");
  await page.getByRole("button", { name: "Выбрать для размещения" }).click();
  await page.mouse.click(bounds.x + bounds.width * 0.58, bounds.y + bounds.height * 0.42);
  await page.getByRole("button", { name: "Открыть в 3D" }).click();
  const editor = page.getByRole("region", { name: "Куб" });
  await expect(editor.getByText("WebGL не удалось запустить.")).toBeVisible();
  await expect(editor.locator("canvas[data-engine]")).toHaveCount(0);
  await expect(editor.getByRole("spinbutton", { name: "Длина ребра" })).toHaveValue("2");
  await expect(editor.getByRole("button", { name: "Повторить запуск 3D" })).toBeVisible();
  await editor.getByRole("button", { name: "Повторить запуск 3D" }).click();
  await expect(editor.getByText("WebGL не удалось запустить.")).toBeVisible();
  await editor.getByRole("button", { name: "Закрыть 3D-окно" }).click();
  await expect(editor).toHaveCount(0);
});
