import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const teacherEmail = "standalone-pilot-teacher@example.test";
const password = "standalone-pilot-e2e-password";
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

interface UrlSnapshot {
  readonly live: number;
  readonly created: number;
  readonly revoked: number;
}

async function watchBlobUrls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const live = new Set<string>();
    let created = 0;
    let revoked = 0;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      live.add(url);
      created++;
      return url;
    };
    URL.revokeObjectURL = (url) => {
      if (live.delete(url)) revoked++;
      revoke(url);
    };
    Object.defineProperty(window, "__mediaLifecycleUrls", {
      value: {
        snapshot: () => ({ live: live.size, created, revoked }),
      },
    });
  });
}

async function urlSnapshot(page: Page): Promise<UrlSnapshot> {
  return page.evaluate(() => {
    const observer = (
      window as typeof window & {
        __mediaLifecycleUrls?: { snapshot(): UrlSnapshot };
      }
    ).__mediaLifecycleUrls;
    if (observer === undefined) throw new Error("Blob URL observer missing");
    return observer.snapshot();
  });
}

async function activeRasters(page: Page): Promise<number> {
  const value = await page
    .getByTestId("board-stage")
    .getAttribute("data-raster-active-decoded-count");
  if (value === null || !Number.isFinite(Number(value))) {
    throw new Error("Raster diagnostic unavailable");
  }
  return Number(value);
}

async function teacherLogin(page: Page): Promise<string> {
  await page.goto("/login?next=/boards");
  await page.getByLabel("Email").fill(teacherEmail);
  await page.getByLabel("Пароль").fill(password);
  await Promise.all([
    page.waitForURL(/\/boards$/u),
    page.getByRole("button", { name: "Продолжить" }).click(),
  ]);
  const context = await page.context().request.get("/api/v1/boards/context");
  expect(context.ok()).toBe(true);
  return ((await context.json()) as { csrfToken: string }).csrfToken;
}

async function board(
  context: BrowserContext,
  csrfToken: string,
  label: string,
): Promise<string> {
  const result = await context.request.post("/api/v1/boards", {
    data: { title: label },
    headers: { "x-csrf-token": csrfToken },
  });
  expect(result.status()).toBe(201);
  return ((await result.json()) as { boardId: string }).boardId;
}

async function invitation(
  workspace: Page,
  boardId: string,
): Promise<{
  readonly invitationId: string;
  readonly joinUrl: string;
}> {
  await workspace.goto("/boards");
  const href = "/b/" + encodeURIComponent(boardId) + "#/board";
  const card = workspace.locator(
    'article.teacher-board-card:has(a[href="' + href + '"])',
  );
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Доступ и ссылки" }).click();
  await workspace
    .getByRole("dialog")
    .getByLabel("Имя ученика")
    .fill("Циклический медиатест");
  const responsePromise = workspace.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/api/v1/boards/" + boardId + "/invitations",
  );
  await workspace
    .getByRole("dialog")
    .getByRole("button", {
      name: "Создать гостевую ссылку",
    })
    .click();
  const result = await responsePromise;
  expect(result.status()).toBe(201);
  const body = (await result.json()) as {
    invitation: { invitationId: string };
    joinUrl: string;
  };
  return { invitationId: body.invitation.invitationId, joinUrl: body.joinUrl };
}

async function uploadMedia(teacher: Page): Promise<void> {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgEpH7DwABpAE8k4sOtwAAAABJRU5ErkJggg==",
    "base64",
  );
  await teacher.getByRole("button", { name: "Медиа" }).click();
  await teacher.getByLabel("Вставить изображения").setInputFiles([
    { buffer: png, mimeType: "image/png", name: "lifecycle.png" },
    { buffer: gif, mimeType: "image/gif", name: "lifecycle.gif" },
  ]);
  await expect(teacher.getByTestId("object-count")).toHaveText("2 объекта");
  await expect(teacher.getByTestId("persistence-status")).toHaveText(
    "Синхронизировано · r1",
    { timeout: 30_000 },
  );
}

async function changeWrite(
  context: BrowserContext,
  boardId: string,
  invitationId: string,
  csrfToken: string,
  writeEnabled: boolean,
): Promise<void> {
  const res = await context.request.patch(
    "/api/v1/boards/" +
      encodeURIComponent(boardId) +
      "/invitations/" +
      encodeURIComponent(invitationId),
    {
      data: { writeEnabled },
      headers: { "x-csrf-token": csrfToken },
    },
  );
  expect(res.ok()).toBe(true);
}

test("F3.3.2-D real PNG/GIF guest reconnect, permission epoch, revoke and board switch", async ({
  browser,
}, testInfo: TestInfo) => {
  test.setTimeout(240_000);
  const teacherContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const evidence: Array<{
    step: string;
    urls: UrlSnapshot;
    activeRasters: number | null;
  }> = [];
  try {
    const workspace = await teacherContext.newPage();
    const csrfToken = await teacherLogin(workspace);
    const firstBoard = await board(
      teacherContext,
      csrfToken,
      "F3.3.2-D board A",
    );
    const secondBoard = await board(
      teacherContext,
      csrfToken,
      "F3.3.2-D board B",
    );
    const invite = await invitation(workspace, firstBoard);
    const teacher = await teacherContext.newPage();
    await watchBlobUrls(teacher);
    await teacher.goto("/b/" + encodeURIComponent(firstBoard) + "#/board");
    await expect(teacher.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r0",
    );
    await uploadMedia(teacher);

    const guest = await guestContext.newPage();
    await watchBlobUrls(guest);
    await guest.goto(invite.joinUrl);
    await expect(guest.getByTestId("object-count")).toHaveText("2 объекта");
    await expect
      .poll(async () => (await urlSnapshot(guest)).live)
      .toBeGreaterThanOrEqual(1);
    await expect.poll(() => activeRasters(guest)).toBeGreaterThanOrEqual(1);
    evidence.push({
      step: "loaded",
      urls: await urlSnapshot(guest),
      activeRasters: await activeRasters(guest),
    });

    await guestContext.setOffline(true);
    await expect.poll(async () => (await urlSnapshot(guest)).live).toBe(0);
    await expect.poll(() => activeRasters(guest)).toBe(0);
    evidence.push({
      step: "offline",
      urls: await urlSnapshot(guest),
      activeRasters: await activeRasters(guest),
    });

    await guestContext.setOffline(false);
    await expect(guest.getByTestId("object-count")).toHaveText("2 объекта");
    await expect
      .poll(async () => (await urlSnapshot(guest)).live)
      .toBeGreaterThanOrEqual(1);
    await expect.poll(() => activeRasters(guest)).toBeGreaterThanOrEqual(1);
    evidence.push({
      step: "reconnected",
      urls: await urlSnapshot(guest),
      activeRasters: await activeRasters(guest),
    });

    await changeWrite(
      teacherContext,
      firstBoard,
      invite.invitationId,
      csrfToken,
      false,
    );
    await guest.getByRole("button", { name: "Настройки доски" }).click();
    await expect(guest.getByText("Режим только для чтения")).toBeVisible();
    await guest
      .getByRole("button", { name: "Закрыть настройки доски" })
      .click();
    await expect
      .poll(async () => (await urlSnapshot(guest)).live)
      .toBeGreaterThanOrEqual(1);
    evidence.push({
      step: "read-only",
      urls: await urlSnapshot(guest),
      activeRasters: await activeRasters(guest),
    });

    await changeWrite(
      teacherContext,
      firstBoard,
      invite.invitationId,
      csrfToken,
      true,
    );
    await guest.getByRole("button", { name: "Настройки доски" }).click();
    await expect(guest.getByText("Права доступа обновлены.")).toBeVisible();
    await expect(guest.getByText("Режим только для чтения")).toHaveCount(0);
    await guest
      .getByRole("button", { name: "Закрыть настройки доски" })
      .click();

    await teacher.goto("/b/" + encodeURIComponent(secondBoard) + "#/board");
    await expect(teacher.getByTestId("object-count")).toHaveText("0 объекта");
    await expect.poll(async () => (await urlSnapshot(teacher)).live).toBe(0);
    await expect.poll(() => activeRasters(teacher)).toBe(0);
    evidence.push({
      step: "board-switch",
      urls: await urlSnapshot(teacher),
      activeRasters: await activeRasters(teacher),
    });
    await teacher.goto("/b/" + encodeURIComponent(firstBoard) + "#/board");
    await expect(teacher.getByTestId("object-count")).toHaveText("2 объекта");

    const revoke = await teacherContext.request.post(
      "/api/v1/boards/" +
        encodeURIComponent(firstBoard) +
        "/invitations/" +
        encodeURIComponent(invite.invitationId) +
        "/revoke",
      { headers: { "x-csrf-token": csrfToken } },
    );
    expect(revoke.ok()).toBe(true);
    await expect(
      guest.getByRole("heading", {
        name: "Доступ к доске недоступен",
      }),
    ).toBeVisible();
    await expect.poll(async () => (await urlSnapshot(guest)).live).toBe(0);
    evidence.push({
      step: "revoked",
      urls: await urlSnapshot(guest),
      activeRasters: null,
    });
    await guest.reload();
    await expect(
      guest.getByRole("heading", {
        name: "Доступ к доске недоступен",
      }),
    ).toBeVisible();

    const report = {
      kind: "tutorboard.media-access-cycles/v1",
      browser: testInfo.project.name,
      evidence,
    };
    console.info("MEDIA_ACCESS_CYCLES", JSON.stringify(report));
    await testInfo.attach("media-access-cycles.json", {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });
  } finally {
    await teacherContext.close();
    await guestContext.close();
  }
});
