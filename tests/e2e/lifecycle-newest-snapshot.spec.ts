import { expect, test } from "@playwright/test";

test("@smoke pagehide commits newest content while an older Worker serialization never replies", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let blocked = 0;
    Object.defineProperty(window, "__blockedBoardSerializationCount", {
      get: () => blocked,
    });
    window.Worker = class extends NativeWorker {
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (
          blocked === 0 &&
          typeof message === "object" &&
          message !== null &&
          "kind" in message &&
          message.kind === "serialize" &&
          "document" in message &&
          typeof message.document === "object" &&
          message.document !== null &&
          "order" in message.document &&
          Array.isArray(message.document.order) &&
          message.document.order.length === 1
        ) {
          blocked += 1;
          return; // Simulate the old Worker staying busy until navigation.
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options ?? {});
      }
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  const bounds = await page.getByTestId("board-stage").boundingBox();
  if (bounds === null) throw new Error("Missing board stage");
  const rectangle = async (offset: number) => {
    await page.keyboard.press("r");
    await page.mouse.move(bounds.x + 160 + offset, bounds.y + 180);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 260 + offset, bounds.y + 280);
    await page.mouse.up();
  };
  await rectangle(0);
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect
    .poll(() =>
      page.evaluate(
        () => Reflect.get(window, "__blockedBoardSerializationCount") as number,
      ),
    )
    .toBe(1);
  await rectangle(180);
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Сохранено локально",
  );
  // The old request remains blocked; only the lifecycle batch could have saved B.
  await expect
    .poll(() =>
      page.evaluate(
        () => Reflect.get(window, "__blockedBoardSerializationCount") as number,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");
});
