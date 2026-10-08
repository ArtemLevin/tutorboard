import { createHash } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const password = "standalone-pilot-e2e-password";
const teacherEmail = "standalone-pilot-teacher@example.test";
const gif1x1 = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

interface AssetDescriptor {
  readonly assetId: string;
  readonly byteSize: number;
  readonly contentSha256: string;
  readonly mimeType: string;
  readonly status: string;
}

async function loginTeacher(page: Page): Promise<string> {
  await page.goto("/login?next=/boards");
  await page.getByLabel("Email").fill(teacherEmail);
  await page.getByLabel("Пароль").fill(password);
  await Promise.all([
    page.waitForURL(/\/boards$/u),
    page.getByRole("button", { name: "Продолжить" }).click(),
  ]);
  const response = await page.context().request.get("/api/v1/boards/context");
  expect(response.status()).toBe(200);
  const context = (await response.json()) as { csrfToken: string };
  expect(context.csrfToken).toBeTruthy();
  return context.csrfToken;
}

async function createBoardAndInvitation(workspace: Page): Promise<{
  readonly boardId: string;
  readonly joinUrl: string;
}> {
  await expect(
    workspace.getByRole("heading", { name: "Мои доски" }),
  ).toBeVisible();
  await workspace.getByRole("button", { name: "+ Создать доску" }).click();
  const responsePromise = workspace.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/boards",
  );
  const dialog = workspace.getByRole("dialog");
  await dialog
    .getByLabel("Название")
    .fill("F3.2 asset-backed media integration");
  await dialog.getByRole("button", { name: "Создать" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const { boardId } = (await response.json()) as { boardId: string };
  const boardHref = `/b/${encodeURIComponent(boardId)}#/board`;
  await expect(workspace).toHaveURL(new RegExp(`/b/${encodeURIComponent(boardId)}#/board$`, "u"));
  await workspace.goto("/boards");
  const card = workspace.locator(
    `article.teacher-board-card:has(a[href="${boardHref}"])`,
  );
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Доступ и ссылки" }).click();
  const invitePromise = workspace.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      new URL(res.url()).pathname === `/api/v1/boards/${boardId}/invitations`,
  );
  const inviteDialog = workspace.getByRole("dialog");
  await inviteDialog.getByLabel("Имя ученика").fill("F3.2 ученик");
  await inviteDialog
    .getByRole("button", { name: "Создать гостевую ссылку" })
    .click();
  const invited = await invitePromise;
  expect(invited.status()).toBe(201);
  const { joinUrl } = (await invited.json()) as { joinUrl: string };
  expect(joinUrl).toContain("/j/");
  return { boardId, joinUrl };
}

async function waitForRevision(page: Page, revision: number): Promise<void> {
  await expect(page.getByTestId("persistence-status")).toHaveText(
    `Синхронизировано · r${revision}`,
  );
}

async function rasterData(
  page: Page,
  mimeType: "image/png" | "image/jpeg",
): Promise<Buffer> {
  const base64 = await page.evaluate((type) => {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 16;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas 2D unavailable");
    context.fillStyle = "#347eaf";
    context.fillRect(0, 0, 24, 16);
    context.fillStyle = "#f59e0b";
    context.fillRect(3, 3, 9, 10);
    return canvas.toDataURL(type).split(",")[1] ?? "";
  }, mimeType);
  return Buffer.from(base64, "base64");
}

async function insertImages(
  page: Page,
  images: readonly {
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly name: string;
  }[],
): Promise<void> {
  await page.getByRole("button", { name: "Медиа" }).click();
  await expect(page.getByText(/PNG, JPEG и GIF до 32 МБ/u)).toBeVisible();
  await page.getByLabel("Вставить изображения").setInputFiles(
    images.map((image) => ({
      buffer: image.buffer,
      mimeType: image.mimeType,
      name: image.name,
    })),
  );
}

async function assertAssetContent(
  context: BrowserContext,
  boardId: string,
  descriptor: AssetDescriptor,
): Promise<void> {
  const base = `/api/v1/boards/${encodeURIComponent(boardId)}/media/${encodeURIComponent(descriptor.assetId)}`;
  const metadata = await context.request.get(base);
  expect(metadata.status()).toBe(200);
  const stored = (await metadata.json()) as AssetDescriptor;
  expect(stored.assetId).toBe(descriptor.assetId);
  expect(stored.contentSha256).toBe(descriptor.contentSha256);
  expect(stored.byteSize).toBe(descriptor.byteSize);
  expect(stored.mimeType).toBe(descriptor.mimeType);
  expect(stored.status).toBe("available");
  const downloaded = await context.request.get(`${base}/content`);
  expect(downloaded.status()).toBe(200);
  expect(downloaded.headers()["content-type"]).toContain(descriptor.mimeType);
  const body = await downloaded.body();
  expect(body.byteLength).toBe(descriptor.byteSize);
  expect(createHash("sha256").update(body).digest("hex")).toBe(
    descriptor.contentSha256,
  );
}

test("F3.2.1 real PNG/JPEG/GIF upload precedes commands and survives guest sync and reload", async ({
  browser,
}) => {
  const teacherContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const workspace = await teacherContext.newPage();
    await loginTeacher(workspace);
    const { boardId, joinUrl } = await createBoardAndInvitation(workspace);
    const boardHref = `/b/${encodeURIComponent(boardId)}#/board`;

    const teacher = await teacherContext.newPage();
    const guest = await guestContext.newPage();
    await teacher.goto(boardHref);
    await guest.goto(joinUrl);
    await waitForRevision(teacher, 0);
    await waitForRevision(guest, 0);

    const png = await rasterData(teacher, "image/png");
    const jpeg = await rasterData(teacher, "image/jpeg");
    const images = [
      { buffer: png, mimeType: "image/png", name: "classwork.png" },
      { buffer: jpeg, mimeType: "image/jpeg", name: "photo.jpeg" },
      { buffer: gif1x1, mimeType: "image/gif", name: "animation.gif" },
    ] as const;
    const uploaded: AssetDescriptor[] = [];
    const commands: string[] = [];
    let uploadCompleted = 0;
    let prematureCommand = false;
    const guestFetchStatuses: number[] = [];
    const mediaPath = new RegExp(
      `/api/v1/boards/${boardId}/media(?:\\?|/)`,
      "u",
    );

    teacher.on("response", (response) => {
      if (
        response.request().method() === "POST" &&
        mediaPath.test(response.url()) &&
        response.status() === 201
      ) {
        uploadCompleted += 1;
        void response
          .json()
          .then((value: AssetDescriptor) => uploaded.push(value));
      }
    });
    teacher.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === `/api/v1/boards/${boardId}/commands`
      ) {
        commands.push(request.postData() ?? "");
        if (uploadCompleted !== images.length) prematureCommand = true;
      }
    });
    guest.on("response", (response) => {
      if (
        response.request().method() === "GET" &&
        response.url().includes(`/boards/${boardId}/media/`) &&
        new URL(response.url()).pathname.endsWith("/content")
      ) {
        guestFetchStatuses.push(response.status());
      }
    });

    await insertImages(teacher, images);
    await waitForRevision(teacher, 1);
    await waitForRevision(guest, 1);
    await expect(teacher.getByTestId("object-count")).toHaveText("3 объекта");
    await expect(guest.getByTestId("object-count")).toHaveText("3 объекта");
    expect(uploadCompleted).toBe(3);
    expect(prematureCommand).toBe(false);
    await expect.poll(() => uploaded.length).toBe(3);
    expect(uploaded.map((asset) => asset.mimeType)).toEqual(
      images.map((image) => image.mimeType),
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('"media.asset"');
    expect(commands[0]).not.toContain("dataUrl");
    expect(commands[0]).not.toContain("data:image");
    expect(commands[0]!.length).toBeLessThan(32_000);

    await expect
      .poll(() => guestFetchStatuses.filter((code) => code === 200).length)
      .toBeGreaterThanOrEqual(3);
    for (const asset of uploaded) {
      expect(asset.status).toBe("available");
      await assertAssetContent(guestContext, boardId, asset);
    }

    await teacher.reload();
    await guest.reload();
    await waitForRevision(teacher, 1);
    await waitForRevision(guest, 1);
    await expect(teacher.getByTestId("object-count")).toHaveText("3 объекта");
    await expect(guest.getByTestId("object-count")).toHaveText("3 объекта");
    await expect
      .poll(() => guestFetchStatuses.filter((code) => code === 200).length)
      .toBeGreaterThanOrEqual(6);

    // A guest writer must use the same authorization, binary storage and
    // revision path, so both actor types are covered by the real backend.
    await insertImages(guest, [
      { buffer: png, mimeType: "image/png", name: "student.png" },
    ]);
    await waitForRevision(guest, 2);
    await waitForRevision(teacher, 2);
    await expect(teacher.getByTestId("object-count")).toHaveText("4 объекта");
    await expect(guest.getByTestId("object-count")).toHaveText("4 объекта");
  } finally {
    await teacherContext.close();
    await guestContext.close();
  }
});
