from pathlib import Path


path = Path("tests/e2e/coordinate-plot-production.spec.ts")
text = path.read_text(encoding="utf-8")
start_marker = '''  await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
  const advancedEditor = page.getByRole("dialog", {
    name: "Расширенные настройки графика",
  });'''
end_marker = '''  await advancedEditor.getByRole("tab", { name: "Функции" }).click();'''
start = text.find(start_marker)
if start < 0:
    raise RuntimeError("Missing production modal-flow start anchor")
end = text.find(end_marker, start)
if end < 0:
    raise RuntimeError("Missing production modal-flow end anchor")
end += len(end_marker)
replacement = '''  const advancedEditor = page.getByRole("dialog", {
    name: "Расширенные настройки графика",
  });
  const persistenceStatus = page.getByTestId("persistence-status");
  const navigation = page.getByRole("toolbar", {
    name: "Навигация координатной плоскости",
  });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("radio", { name: "Только ось X" }).click();
  await expect(
    navigation.getByRole("radio", { name: "Только ось X" }),
  ).toHaveAttribute("aria-checked", "true");
  await navigation.getByRole("button", { name: "Приблизить график" }).click();

  await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
  await expect(advancedEditor).toBeVisible();
  await advancedEditor.getByRole("tab", { name: "Вид" }).click();
  const xMinimum = advancedEditor.getByLabel("Минимальная граница X");
  const yMinimum = advancedEditor.getByLabel("Минимальная граница Y");
  const yMaximum = advancedEditor.getByLabel("Максимальная граница Y");
  await expect(xMinimum).not.toHaveValue("-10");
  await expect(yMinimum).toHaveValue("-7");
  await expect(
    advancedEditor.getByTestId("renderer-status-help"),
  ).toContainText("Лимит детализации");
  await advancedEditor
    .getByRole("button", { name: "К базовым настройкам" })
    .click();
  await expect(advancedEditor).toBeHidden();

  await navigation
    .getByRole("button", { name: "Сбросить диапазон графика" })
    .click();
  await navigation
    .getByRole("button", { name: "Вместить все графики" })
    .click();

  const stage = page.locator(".konvajs-content");
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  const plotPoint = {
    x: stageBox!.x + stageBox!.width / 2 - 100,
    y: stageBox!.y + stageBox!.height / 2 + 80,
  };
  await page.mouse.move(plotPoint.x, plotPoint.y);
  await expect(stage).toHaveCSS("cursor", "grab");
  await page.mouse.down();
  await page.mouse.move(plotPoint.x + 24, plotPoint.y + 12);
  await expect(stage).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  await expect(stage).toHaveCSS("cursor", "grab");
  await navigation
    .getByRole("button", { name: "Сбросить диапазон графика" })
    .click();

  if (test.info().project.name === "chromium") {
    await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
    await expect(advancedEditor).toBeVisible();
    await advancedEditor.getByRole("tab", { name: "Вид" }).click();
    const beforePinchX = Number(await xMinimum.inputValue());
    const beforePinchY = Number(await yMinimum.inputValue());
    const beforePinchYSpan = Number(await yMaximum.inputValue()) - beforePinchY;
    await advancedEditor
      .getByRole("button", { name: "К базовым настройкам" })
      .click();
    await expect(advancedEditor).toBeHidden();

    await page.evaluate(({ x, y }) => {
      const target =
        window.document.querySelector<HTMLElement>(".konvajs-content");
      if (target === null) throw new Error("Konva stage is missing");
      const touch = (identifier: number, clientX: number, clientY: number) =>
        new Touch({ identifier, target, clientX, clientY });
      const start = [touch(1, x - 50, y), touch(2, x + 50, y)];
      const moved = [touch(1, x - 95, y + 10), touch(2, x + 95, y + 10)];
      target.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          changedTouches: start,
          targetTouches: start,
          touches: start,
        }),
      );
      target.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          changedTouches: moved,
          targetTouches: moved,
          touches: moved,
        }),
      );
      target.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          changedTouches: moved,
          targetTouches: [],
          touches: [],
        }),
      );
    }, plotPoint);

    await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
    await expect(advancedEditor).toBeVisible();
    await advancedEditor.getByRole("tab", { name: "Вид" }).click();
    await expect
      .poll(async () => Number(await xMinimum.inputValue()))
      .not.toBe(beforePinchX);
    await expect
      .poll(async () => Number(await yMinimum.inputValue()))
      .not.toBe(beforePinchY);
    await expect
      .poll(async () => {
        const currentMinimum = Number(await yMinimum.inputValue());
        const currentMaximum = Number(await yMaximum.inputValue());
        return Math.abs(currentMaximum - currentMinimum - beforePinchYSpan);
      })
      .toBeLessThan(1e-8);
    await advancedEditor
      .getByRole("button", { name: "К базовым настройкам" })
      .click();
    await expect(advancedEditor).toBeHidden();
  }

  await navigation
    .getByRole("button", { name: "Сбросить диапазон графика" })
    .click();
  await editor.getByRole("button", { name: /Расширенные настройки/ }).click();
  await expect(advancedEditor).toBeVisible();
  await advancedEditor.getByRole("tab", { name: "Функции" }).click();'''
path.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
print("Aligned production flow with the modal advanced editor")
