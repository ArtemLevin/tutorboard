import { createRequire } from "node:module";

import { expect, test, type Page } from "@playwright/test";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  readonly PNG: {
    new (options: { readonly height: number; readonly width: number }): {
      readonly data: Buffer;
      readonly height: number;
      readonly width: number;
    };
    readonly sync: {
      readonly write: (image: {
        readonly data: Buffer;
        readonly height: number;
        readonly width: number;
      }) => Buffer;
    };
  };
};

const teacherEmail = "standalone-pilot-teacher@example.test";
const teacherPassword = "standalone-pilot-e2e-password";
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);
const profileMode = process.env.F3_MEDIA_PROFILE ?? "smoke";
if (profileMode !== "smoke" && profileMode !== "full") {
  throw new Error("F3_MEDIA_PROFILE must be smoke or full.");
}

interface Scenario {
  readonly name: string;
  readonly images: number;
  readonly gifs: number;
}
const scenarios: readonly Scenario[] = [
  { name: "10-static-1-gif", images: 10, gifs: 1 },
  { name: "50-static-4-gif", images: 50, gifs: 4 },
  { name: "100-static-8-gif", images: 100, gifs: 8 },
];
const selected = profileMode === "full" ? scenarios : scenarios.slice(0, 1);

interface BrowserSnapshot {
  readonly decodedCalls: number;
  readonly gifObjectUrls: number;
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
  readonly jsHeapBytes: number | null;
}

async function browserSnapshot(page: Page): Promise<BrowserSnapshot> {
  return page.evaluate(() => {
    const monitor = (
      globalThis as typeof globalThis & {
        __f3AssetBaseline?: { readonly snapshot: () => BrowserSnapshot };
      }
    ).__f3AssetBaseline;
    if (monitor === undefined)
      throw new Error("Asset baseline instrumentation missing.");
    return monitor.snapshot();
  });
}

async function measureFrames(page: Page, count = 100) {
  return page.evaluate(async (length) => {
    const samples: number[] = [];
    let last = 0;
    for (let index = 0; index < length + 1; index += 1) {
      const current = await new Promise<number>((resolve) => {
        requestAnimationFrame(resolve);
      });
      if (last !== 0) samples.push(current - last);
      last = current;
    }
    samples.sort((a, b) => a - b);
    const percentile = (fraction: number) =>
      samples[
        Math.min(samples.length - 1, Math.ceil(samples.length * fraction) - 1)
      ] ?? 0;
    return {
      count: samples.length,
      frameP50Ms: percentile(0.5),
      frameP95Ms: percentile(0.95),
      frameMaxMs: samples.at(-1) ?? 0,
    };
  }, count);
}

function deterministicPng(): Buffer {
  const image = new PNG({ width: 512, height: 512 });
  for (let index = 0; index < image.width * image.height; index += 1) {
    const at = index * 4;
    image.data[at] = index % 256;
    image.data[at + 1] = Math.floor(index / image.width) % 256;
    image.data[at + 2] = (index * 7) % 256;
    image.data[at + 3] = 255;
  }
  return PNG.sync.write(image);
}

async function boardForTeacher(page: Page): Promise<string> {
  await page.goto("/login?next=/boards");
  await page.getByLabel("Email").fill(teacherEmail);
  await page.getByLabel("Пароль").fill(teacherPassword);
  await Promise.all([
    page.waitForURL(/\/boards$/u),
    page.getByRole("button", { name: "Продолжить" }).click(),
  ]);
  const context = await page.context().request.get("/api/v1/boards/context");
  expect(context.status()).toBe(200);
  const { csrfToken } = (await context.json()) as { csrfToken: string };
  const created = await page.context().request.post("/api/v1/boards", {
    data: { title: "F3.3.1 asset-backed load baseline" },
    headers: { "x-csrf-token": csrfToken },
  });
  expect(created.status()).toBe(201);
  const { boardId } = (await created.json()) as { boardId: string };
  await page.goto("/b/" + encodeURIComponent(boardId) + "#/board");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Синхронизировано · r0",
  );
  return boardId;
}

async function uploadBoardMedia(
  page: Page,
  input: Scenario,
  png: Buffer,
): Promise<void> {
  const chooser = page.getByLabel("Вставить изображения");
  await page.getByRole("button", { name: "Медиа" }).click();
  const items = [
    ...Array.from({ length: input.images }, (_, index) => ({
      buffer: png,
      mimeType: "image/png",
      name: "sample-" + String(index).padStart(3, "0") + ".png",
    })),
    ...Array.from({ length: input.gifs }, (_, index) => ({
      buffer: gif,
      mimeType: "image/gif",
      name: "animated-" + String(index).padStart(3, "0") + ".gif",
    })),
  ];
  let count = 0;
  let revision = 0;
  for (let start = 0; start < items.length; start += 10) {
    const batch = items.slice(start, start + 10);
    await chooser.setInputFiles(batch);
    count += batch.length;
    revision += 1;
    await expect(page.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r" + revision,
      { timeout: 60_000 },
    );
    await expect(page.getByTestId("object-count")).toHaveText(
      new RegExp("^" + count + " объект", "u"),
    );
  }
}

async function panZoom(page: Page): Promise<void> {
  const rect = await page.getByTestId("board-stage").boundingBox();
  if (rect === null) throw new Error("Board stage unavailable");
  const x = rect.x + Math.min(rect.width - 120, 60);
  const y = rect.y + Math.min(rect.height - 120, 60);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 60, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, 240);
  await page.mouse.move(x + 90, y + 60);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
}

for (const scenario of selected) {
  test(
    "@asset-baseline F3.3.1 real media load: " + scenario.name,
    async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      await page.addInitScript(() => {
        const state = {
          decodedCalls: 0,
          gifObjectUrls: 0,
          longTasks: [] as number[],
        };
        const originalBitmap = window.createImageBitmap;
        Object.defineProperty(window, "createImageBitmap", {
          configurable: true,
          value: (...args: unknown[]) => {
            state.decodedCalls += 1;
            return Reflect.apply(originalBitmap, window, args);
          },
        });
        const originalObjectUrl = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (object) => {
          if (object instanceof Blob && object.type === "image/gif") {
            state.gifObjectUrls += 1;
          }
          return originalObjectUrl(object);
        };
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.duration >= 50) state.longTasks.push(entry.duration);
            }
          }).observe({ entryTypes: ["longtask"] });
        } catch {
          // Long Tasks API is optional; browser coverage remains functional.
        }
        const heap = () => {
          const memory = performance as Performance & {
            readonly memory?: { readonly usedJSHeapSize: number };
          };
          return memory.memory?.usedJSHeapSize ?? null;
        };
        (
          window as typeof window & {
            __f3AssetBaseline?: { readonly snapshot: () => BrowserSnapshot };
          }
        ).__f3AssetBaseline = {
          snapshot: () => ({
            decodedCalls: state.decodedCalls,
            gifObjectUrls: state.gifObjectUrls,
            longTaskCount: state.longTasks.length,
            longTaskTotalMs: state.longTasks.reduce(
              (sum, value) => sum + value,
              0,
            ),
            jsHeapBytes: heap(),
          }),
        };
      });
      const boardId = await boardForTeacher(page);
      const png = deterministicPng();
      const expectedObjects = scenario.images + scenario.gifs;
      const responses = {
        cold: { ok: 0, failed: 0, contentLength: 0 },
        warm: { ok: 0, failed: 0, contentLength: 0 },
      };
      let phase: "cold" | "warm" = "cold";
      await uploadBoardMedia(page, scenario, png);
      const network = await page.context().newCDPSession(page);
      await network.send("Network.enable");
      await network.send("Network.setCacheDisabled", { cacheDisabled: true });
      page.on("response", (response) => {
        if (
          response.request().method() !== "GET" ||
          !new URL(response.url()).pathname.includes(
            "/boards/" + boardId + "/media/",
          ) ||
          !new URL(response.url()).pathname.endsWith("/content")
        )
          return;
        const counter = responses[phase];
        if (response.ok()) {
          counter.ok += 1;
          const bytes = Number(response.headers()["content-length"] ?? 0);
          if (Number.isFinite(bytes)) counter.contentLength += bytes;
        } else {
          counter.failed += 1;
        }
      });
      const coldStart = Date.now();
      await page.reload();
      await expect(page.getByTestId("object-count")).toHaveText(
        new RegExp("^" + expectedObjects + " объект", "u"),
      );
      await expect
        .poll(() => responses.cold.ok, { timeout: 30_000 })
        .toBeGreaterThan(0);
      await expect
        .poll(async () => (await browserSnapshot(page)).decodedCalls, {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);
      const cold = {
        elapsedMs: Date.now() - coldStart,
        ...(await browserSnapshot(page)),
      };
      const frameProfile = await Promise.all([
        measureFrames(page),
        panZoom(page),
      ]);
      const active = { ...frameProfile[0], ...(await browserSnapshot(page)) };
      phase = "warm";
      await network.send("Network.setCacheDisabled", { cacheDisabled: false });
      const warmStart = Date.now();
      await page.reload();
      await expect(page.getByTestId("object-count")).toHaveText(
        new RegExp("^" + expectedObjects + " объект", "u"),
      );
      await expect
        .poll(async () => (await browserSnapshot(page)).decodedCalls, {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);
      const warm = {
        elapsedMs: Date.now() - warmStart,
        ...(await browserSnapshot(page)),
      };
      const report = {
        kind: "tutorboard.media-asset-baseline/v1",
        generatedAt: new Date().toISOString(),
        scenario,
        decodedPixelEstimateBytes: scenario.images * 512 * 512 * 4,
        pngPayloadBytes: png.byteLength,
        cold,
        active,
        warm,
        requests: responses,
        browser: testInfo.project.name,
      };
      expect(active.count).toBe(100);
      expect(active.frameP95Ms).toBeGreaterThan(0);
      expect(responses.cold.failed + responses.warm.failed).toBe(0);
      console.info("REAL_MEDIA_BASELINE", JSON.stringify(report));
      await testInfo.attach("f3-3-1-" + scenario.name + ".json", {
        body: Buffer.from(JSON.stringify(report, null, 2)),
        contentType: "application/json",
      });
    },
  );
}
