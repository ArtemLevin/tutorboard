import { expect, test, type Page } from "@playwright/test";

const maximumMutableWetInkTailPoints = 120;

async function openBoardWithPen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(window, "__tutorboardLongTasks", []);
    const supported =
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
    Reflect.set(window, "__tutorboardLongTaskSupported", supported);
    if (supported) {
      const observer = new PerformanceObserver((list) => {
        const entries = Reflect.get(
          window,
          "__tutorboardLongTasks",
        ) as number[];
        for (const entry of list.getEntries()) entries.push(entry.duration);
      });
      observer.observe({ type: "longtask", buffered: true });
      Reflect.set(window, "__tutorboardLongTaskObserver", observer);
    }
    window.addEventListener(
      "pointerdown",
      (event) => {
        Reflect.set(window, "__tutorboardActivePointerId", event.pointerId);
      },
      { capture: true },
    );
  });
  await page.goto("/");
  await expect(
    page.getByRole("application", {
      name: "Бесконечное полотно TutorBoard",
    }),
  ).toBeVisible();
  const stage = page.getByTestId("board-stage");
  await expect(stage).toHaveAttribute("data-wet-ink-layer", "ready");
  const drawingMenu = page.getByRole("button", { name: "Рисование" });
  await drawingMenu.click();
  await page.getByRole("menuitemradio", { name: "Перо (P)" }).click();
  await expect(drawingMenu).toHaveAttribute("aria-pressed", "true");
}

async function startStroke(page: Page) {
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) throw new Error("Canvas has no bounds.");
  const start = {
    x: bounds.x + Math.min(180, bounds.width * 0.25),
    y: bounds.y + Math.min(220, bounds.height * 0.45),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(stage).toHaveAttribute("data-wet-ink-active", "true");
  const pointerId = await page.evaluate(
    () => Reflect.get(window, "__tutorboardActivePointerId") as number,
  );
  expect(Number.isInteger(pointerId)).toBe(true);
  return { bounds, pointerId, start };
}

async function dispatchCoalescedStroke(
  page: Page,
  options: {
    readonly frames: number;
    readonly pointerId: number;
    readonly samplesPerFrame: number;
    readonly startX: number;
    readonly startY: number;
  },
) {
  await page.evaluate(async (input) => {
    const makePointer = (
      type: "pointermove" | "pointerup",
      x: number,
      y: number,
      pressure: number,
    ) =>
      new PointerEvent(type, {
        bubbles: true,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: x,
        clientY: y,
        pointerId: input.pointerId,
        pointerType: "pen",
        pressure,
      });

    let sampleIndex = 0;
    for (let frame = 0; frame < input.frames; frame += 1) {
      const coalesced = Array.from(
        { length: input.samplesPerFrame },
        (_value, index) => {
          sampleIndex += 1;
          return makePointer(
            "pointermove",
            input.startX + sampleIndex * 1.5,
            input.startY + Math.sin(sampleIndex / 10) * 22,
            0.3 + ((sampleIndex + index) % 20) / 40,
          );
        },
      );
      const last = coalesced.at(-1);
      if (last === undefined) continue;
      const dispatched = makePointer(
        "pointermove",
        last.clientX,
        last.clientY,
        last.pressure,
      );
      Object.defineProperty(dispatched, "getCoalescedEvents", {
        configurable: true,
        value: () => coalesced,
      });
      window.dispatchEvent(dispatched);

      if (frame === Math.floor(input.frames / 2)) {
        const burst = Array.from({ length: 64 }, (_value, index) => {
          sampleIndex += 1;
          return makePointer(
            "pointermove",
            input.startX + sampleIndex * 1.5,
            input.startY + Math.sin(sampleIndex / 10) * 22,
            0.35 + (index % 16) / 32,
          );
        });
        const burstLast = burst.at(-1);
        if (burstLast !== undefined) {
          const burstEvent = makePointer(
            "pointermove",
            burstLast.clientX,
            burstLast.clientY,
            burstLast.pressure,
          );
          Object.defineProperty(burstEvent, "getCoalescedEvents", {
            configurable: true,
            value: () => burst,
          });
          window.dispatchEvent(burstEvent);
        }
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }

    const endX = input.startX + sampleIndex * 1.5;
    const endY = input.startY + Math.sin(sampleIndex / 10) * 22;
    window.dispatchEvent(makePointer("pointerup", endX, endY, 0));
  }, options);
}

test("@smoke sustained 240 Hz coalesced pen input drains backlog with bounded wet ink tail", async ({
  page,
}) => {
  await openBoardWithPen(page);
  const { pointerId, start } = await startStroke(page);
  const stage = page.getByTestId("board-stage");

  await page.evaluate(() => {
    const entries = Reflect.get(window, "__tutorboardLongTasks");
    if (Array.isArray(entries)) entries.length = 0;
  });

  await dispatchCoalescedStroke(page, {
    frames: 90,
    pointerId,
    samplesPerFrame: 4,
    startX: start.x,
    startY: start.y,
  });

  await expect(stage).toHaveAttribute("data-wet-ink-active", "false");
  await expect(page.getByTestId("object-count")).toHaveText("1 объекта");
  await expect
    .poll(async () =>
      Number((await stage.getAttribute("data-pointer-backlog")) ?? 0),
    )
    .toBe(0);

  const peakBacklog = Number(
    (await stage.getAttribute("data-pointer-backlog-peak")) ?? "NaN",
  );
  const lastBatchSize = Number(
    (await stage.getAttribute("data-pointer-last-batch-size")) ?? "NaN",
  );
  const p95 = Number(
    (await stage.getAttribute("data-wet-ink-latency-p95-ms")) ?? "NaN",
  );
  const maxFrameGap = Number(
    (await stage.getAttribute("data-wet-ink-max-frame-gap-ms")) ?? "NaN",
  );
  const mutableTail = Number(
    (await stage.getAttribute("data-wet-ink-mutable-tail-points")) ?? "NaN",
  );
  const sealedChunks = Number(
    (await stage.getAttribute("data-wet-ink-sealed-chunks")) ?? "NaN",
  );
  const frameCount = Number(
    (await stage.getAttribute("data-wet-ink-frame-count")) ?? "NaN",
  );
  const diagnosticPublishCount = Number(
    (await stage.getAttribute("data-wet-ink-diagnostic-publish-count")) ??
      "NaN",
  );
  const longTaskEvidence = await page.evaluate(() => {
    const entries = Reflect.get(window, "__tutorboardLongTasks");
    const durations = Array.isArray(entries)
      ? entries.filter((value): value is number => typeof value === "number")
      : [];
    return {
      count: durations.length,
      maxMs: durations.length === 0 ? 0 : Math.max(...durations),
      supported:
        Reflect.get(window, "__tutorboardLongTaskSupported") === true,
    };
  });

  expect(peakBacklog).toBeGreaterThanOrEqual(4);
  expect(lastBatchSize).toBeGreaterThan(0);
  expect(mutableTail).toBeLessThanOrEqual(maximumMutableWetInkTailPoints);
  expect(sealedChunks).toBeGreaterThan(0);
  expect(p95).toBeLessThan(100);
  expect(maxFrameGap).toBeLessThan(150);
  expect(frameCount).toBeGreaterThan(30);
  expect(diagnosticPublishCount).toBeLessThan(frameCount / 3);
  if (longTaskEvidence.supported) {
    expect(longTaskEvidence.count).toBeLessThanOrEqual(4);
    expect(longTaskEvidence.maxMs).toBeLessThan(200);
  }

  await page.mouse.up();
});
