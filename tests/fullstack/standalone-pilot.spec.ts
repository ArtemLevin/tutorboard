import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const password = "standalone-pilot-e2e-password";
const teacherEmail = "standalone-pilot-teacher@example.test";
const pageDiagnostics = new WeakMap<Page, string[]>();

function redactDiagnostics(value: string): string {
  return value.replace(/\/j\/[A-Za-z0-9_-]+/gu, "/j/<redacted>");
}

function capturePageDiagnostics(page: Page): void {
  const events: string[] = [];
  pageDiagnostics.set(page, events);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      events.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    events.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    events.push(
      `requestfailed: ${request.method()} ${url.pathname} ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      events.push(
        `response: ${response.status()} ${response.request().method()} ${url.pathname}`,
      );
    }
  });
  page.on("websocket", (socket) => {
    const pathname = new URL(socket.url()).pathname;
    events.push(`websocket.open: ${pathname}`);
    socket.on("close", () => events.push(`websocket.close: ${pathname}`));
    socket.on("socketerror", (error) =>
      events.push(`websocket.error: ${pathname} ${error}`),
    );
  });
}

async function loginTeacher(page: Page): Promise<string> {
  await page.goto("/login?next=/boards");
  await page.getByLabel("Email").fill(teacherEmail);
  await page.getByLabel("Пароль").fill(password);
  await Promise.all([
    page.waitForURL(/\/boards$/),
    page.getByRole("button", { name: "Продолжить" }).click(),
  ]);

  const contextResponse = await page
    .context()
    .request.get("/api/v1/boards/context");
  expect(contextResponse.ok()).toBe(true);
  const managementContext = (await contextResponse.json()) as {
    csrfToken: string;
    role: string;
  };
  expect(managementContext.role).toBe("admin");
  expect(managementContext.csrfToken).not.toHaveLength(0);
  return managementContext.csrfToken;
}

async function draw(
  page: Page,
  key: "p" | "r",
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): Promise<void> {
  await page.keyboard.press(key);
  const bounds = await page.getByTestId("board-stage").boundingBox();
  if (bounds === null) throw new Error("Board stage has no bounds");
  await page.mouse.move(bounds.x + start.x, bounds.y + start.y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + end.x, bounds.y + end.y, { steps: 8 });
  await page.mouse.up();
}

async function clearBoard(page: Page): Promise<void> {
  const box = await page.getByTestId("board-stage").boundingBox();
  if (box === null) throw new Error("Board stage has no bounds");
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.85, {
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Очистить холст" }).click();
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
}

async function expectRevision(page: Page, revision: number): Promise<void> {
  try {
    await expect(page.getByTestId("persistence-status")).toHaveText(
      `Синхронизировано · r${revision}`,
    );
  } catch (error) {
    const body = redactDiagnostics(
      (await page.locator("body").innerText()).trim(),
    );
    const events = pageDiagnostics.get(page) ?? [];
    throw new Error(
      [
        `Board revision r${revision} was not reached at ${redactDiagnostics(page.url())}.`,
        `DOM:\n${body.slice(0, 4_000)}`,
        `Browser events:\n${events.map(redactDiagnostics).join("\n") || "(none)"}`,
      ].join("\n\n"),
      { cause: error },
    );
  }
}

async function expectQuarantinedChange(page: Page): Promise<void> {
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Изолировано изменений · 1",
  );
}

async function expectCollaborationOnline(page: Page): Promise<void> {
  try {
    await expect(page.getByText(/^В комнате \d+$/u)).toBeVisible();
  } catch (error) {
    const body = redactDiagnostics(
      (await page.locator("body").innerText()).trim(),
    );
    const events = pageDiagnostics.get(page) ?? [];
    throw new Error(
      [
        `Collaboration did not reconnect at ${redactDiagnostics(page.url())}.`,
        `DOM:\n${body.slice(0, 4_000)}`,
        `Browser events:\n${events.map(redactDiagnostics).join("\n") || "(none)"}`,
      ].join("\n\n"),
      { cause: error },
    );
  }
}

async function setInvitationWrite(
  context: BrowserContext,
  boardId: string,
  invitationId: string,
  csrfToken: string,
  writeEnabled: boolean,
): Promise<void> {
  const response = await context.request.patch(
    `/api/v1/boards/${encodeURIComponent(boardId)}/invitations/${encodeURIComponent(invitationId)}`,
    {
      data: { writeEnabled },
      headers: { "x-csrf-token": csrfToken },
    },
  );
  expect(response.ok()).toBe(true);
}

test("teacher invitation guest collaboration access convergence and revoke", async ({
  browser,
}) => {
  const teacherContext = await browser.newContext();
  const guestContext = await browser.newContext();

  try {
    const workspace = await teacherContext.newPage();
    capturePageDiagnostics(workspace);
    const teacherCsrf = await loginTeacher(workspace);
    await expect(
      workspace.getByRole("heading", { name: "Мои доски" }),
    ).toBeVisible();

    await workspace.getByRole("button", { name: "+ Создать доску" }).click();
    const createBoardResponsePromise = workspace.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/boards",
    );
    const createDialog = workspace.getByRole("dialog");
    await createDialog.getByLabel("Название").fill("Пилотная доска");
    await createDialog.getByRole("button", { name: "Создать" }).click();
    const createdBoard = (await (await createBoardResponsePromise).json()) as {
      boardId: string;
    };
    const boardId = createdBoard.boardId;
    const teacherBoardHref = `/b/${encodeURIComponent(boardId)}#/board`;

    await expect(workspace).toHaveURL(
      new RegExp(`/b/${encodeURIComponent(boardId)}#/board$`),
    );
    await expectRevision(workspace, 0);

    await workspace.goto("/boards");
    await expect(
      workspace.getByRole("heading", { name: "Мои доски" }),
    ).toBeVisible();
    const boardCard = workspace.locator(
      `article.teacher-board-card:has(a[href="${teacherBoardHref}"])`,
    );
    await expect(boardCard).toHaveCount(1);

    await boardCard.getByRole("button", { name: "Доступ и ссылки" }).click();
    const invitationDialog = workspace.getByRole("dialog");
    await invitationDialog.getByLabel("Имя ученика").fill("Пилотный ученик");
    const invitationResponsePromise = workspace.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          `/api/v1/boards/${boardId}/invitations`,
    );
    await invitationDialog
      .getByRole("button", { name: "Создать гостевую ссылку" })
      .click();
    const invitationResult = (await (
      await invitationResponsePromise
    ).json()) as {
      invitation: { invitationId: string };
      joinUrl: string;
    };
    expect(invitationResult.joinUrl).toContain("/j/");
    const invitationId = invitationResult.invitation.invitationId;
    await expect(
      invitationDialog.getByRole("textbox", { name: "Гостевая ссылка" }),
    ).toHaveValue(invitationResult.joinUrl);

    const teacher = await teacherContext.newPage();
    capturePageDiagnostics(teacher);
    await teacher.goto(teacherBoardHref);
    await expectRevision(teacher, 0);

    const guest = await guestContext.newPage();
    capturePageDiagnostics(guest);
    await guest.goto(invitationResult.joinUrl);
    await expect(guest).toHaveURL(
      new RegExp(`/b/${encodeURIComponent(boardId)}#/board$`),
    );
    await expectRevision(guest, 0);
    await guest.getByRole("button", { name: "Настройки доски" }).click();
    await expect(guest.getByText("Ученик · Пилотный ученик")).toBeVisible();
    await expect(guest.getByText("Режим только для чтения")).toHaveCount(0);
    await guest.keyboard.press("Escape");

    // Follow is an explicit guest choice and is never enabled by default.
    await expect(
      guest.getByRole("button", { name: "Следовать за преподавателем" }),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Следовать за преподавателем" })
      .click();
    await expect(guest.getByTestId("teacher-follow")).toHaveAttribute(
      "data-follow-zoom",
      "1",
    );
    await expect(
      guest.getByRole("button", {
        name: "Отключить следование за преподавателем",
      }),
    ).toBeVisible();

    await draw(teacher, "p", { x: 340, y: 210 }, { x: 520, y: 300 });
    await expectRevision(teacher, 1);
    await expectRevision(guest, 1);
    await expect(guest.getByTestId("object-count")).toHaveText("1 объекта");

    await guestContext.setOffline(true);
    // Drop follow on disconnect, and never resume it implicitly after reconnect.
    await expect(guest.getByTestId("teacher-follow")).toHaveCount(0);
    await expect(guest.getByTestId("persistence-status")).toHaveText(
      "Автономный режим",
    );
    await draw(teacher, "r", { x: 260, y: 360 }, { x: 410, y: 450 });
    await expectRevision(teacher, 2);
    await expect(guest.getByTestId("object-count")).toHaveText("1 объекта");

    await guestContext.setOffline(false);
    await expectRevision(guest, 2);
    await expect(guest.getByTestId("object-count")).toHaveText("2 объекта");
    await expect(
      guest.getByRole("button", { name: "Следовать за преподавателем" }),
    ).toBeVisible();
    await guest.getByRole("button", { name: "Настройки доски" }).click();
    await expectCollaborationOnline(guest);
    await guest.keyboard.press("Escape");

    await draw(guest, "p", { x: 610, y: 180 }, { x: 680, y: 340 });
    await expectRevision(guest, 3);
    await expectRevision(teacher, 3);
    await expect(teacher.getByTestId("object-count")).toHaveText("3 объекта");

    // Queue one guest mutation under the current access epoch, then change the
    // invitation while that guest is offline. Reconnect must quarantine the
    // stale pending command and restore the confirmed r3 document.
    await guestContext.setOffline(true);
    await draw(guest, "p", { x: 720, y: 220 }, { x: 760, y: 320 });
    await expect(guest.getByTestId("object-count")).toHaveText("4 объекта");
    await setInvitationWrite(
      teacherContext,
      boardId,
      invitationId,
      teacherCsrf,
      false,
    );

    await guestContext.setOffline(false);
    await expectQuarantinedChange(guest);
    await expect(guest.getByTestId("object-count")).toHaveText("3 объекта");
    await guest.getByRole("button", { name: "Настройки доски" }).click();
    await expect(guest.getByText("Режим только для чтения")).toBeVisible();
    await expectCollaborationOnline(guest);
    await guest.keyboard.press("Escape");
    // Read-only guest keeps local control; opting in never produces board commands.
    await guest
      .getByRole("button", { name: "Следовать за преподавателем" })
      .click();
    await expect(guest.getByTestId("teacher-follow")).toHaveAttribute(
      "data-follow-zoom",
      "1",
    );
    const guestBounds = await guest.getByTestId("board-stage").boundingBox();
    if (guestBounds === null) throw new Error("Guest stage missing");
    await guest.mouse.move(guestBounds.x + 420, guestBounds.y + 310);
    await guest.mouse.wheel(0, -160);
    await expect(
      guest.getByRole("button", { name: "Следовать за преподавателем" }),
    ).toBeVisible();
    await expectRevision(teacher, 3);

    await setInvitationWrite(
      teacherContext,
      boardId,
      invitationId,
      teacherCsrf,
      true,
    );
    await guest.getByRole("button", { name: "Настройки доски" }).click();
    await expect(guest.getByText("Права доступа обновлены.")).toBeVisible();
    await expect(guest.getByText("Режим только для чтения")).toHaveCount(0);
    await expectCollaborationOnline(guest);
    await guest.keyboard.press("Escape");

    await draw(guest, "p", { x: 760, y: 180 }, { x: 810, y: 300 });
    await expectQuarantinedChange(guest);
    await expectRevision(teacher, 4);
    await expect(teacher.getByTestId("object-count")).toHaveText("4 объекта");

    // Teacher navigation must not move the guest while follow is OFF.
    const guestViewportBefore = await guest
      .getByTestId("board-stage")
      .getAttribute("data-viewport-zoom");
    const teacherBounds = await teacher
      .getByTestId("board-stage")
      .boundingBox();
    if (teacherBounds === null) throw new Error("Teacher stage missing");
    await teacher.mouse.move(teacherBounds.x + 450, teacherBounds.y + 320);
    await teacher.mouse.wheel(0, -160);
    await expect(teacher.getByTestId("board-stage")).toHaveAttribute(
      "data-viewport-zoom",
      "1.0800",
    );
    // Two teacher zoom events establish a viewport different from the guest's
    // independent camera; an OFF follower must remain completely stationary.
    await teacher.mouse.wheel(0, -160);
    await expect(teacher.getByTestId("board-stage")).toHaveAttribute(
      "data-viewport-zoom",
      "1.1664",
    );
    await expect(guest.getByTestId("board-stage")).toHaveAttribute(
      "data-viewport-zoom",
      guestViewportBefore ?? "1.0000",
    );

    await guest
      .getByRole("button", { name: "Следовать за преподавателем" })
      .click();
    await expect(guest.getByTestId("board-stage")).toHaveAttribute(
      "data-viewport-zoom",
      "1.1664",
    );
    await teacher.mouse.wheel(0, -160);
    await expect(guest.getByTestId("board-stage")).toHaveAttribute(
      "data-viewport-zoom",
      "1.2597",
    );
    await guest
      .getByRole("button", { name: "Отключить следование за преподавателем" })
      .click();
    await expect(
      guest.getByRole("button", { name: "Следовать за преподавателем" }),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Следовать за преподавателем" })
      .click();
    // A teacher page reconnect must terminate an old follow subscription.
    await teacher.reload();
    await expect(teacher.getByTestId("board-stage")).toBeVisible();
    await expect(
      guest.getByRole("button", { name: "Следовать за преподавателем" }),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Следовать за преподавателем" })
      .click();

    const revoke = await teacherContext.request.post(
      `/api/v1/boards/${encodeURIComponent(boardId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
      { headers: { "x-csrf-token": teacherCsrf } },
    );
    expect(revoke.ok()).toBe(true);
    await expect(
      guest.getByRole("heading", { name: "Доступ к доске недоступен" }),
    ).toBeVisible();
    await expect(guest.getByTestId("teacher-follow")).toHaveCount(0);
  } finally {
    await teacherContext.close();
    await guestContext.close();
  }
});

// Uses the pinned standalone backend and two independent authenticated sessions.
test("collaborative clear Undo preserves peer edits and survives immediate Undo and reload", async ({
  browser,
}) => {
  const teacherContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const teacher = await teacherContext.newPage();
    capturePageDiagnostics(teacher);
    const csrf = await loginTeacher(teacher);
    const created = await teacherContext.request.post("/api/v1/boards", {
      data: { title: "Совместная очистка и Undo" },
      headers: { "x-csrf-token": csrf },
    });
    expect(created.ok()).toBe(true);
    const { boardId } = (await created.json()) as { boardId: string };
    const invited = await teacherContext.request.post(
      `/api/v1/boards/${encodeURIComponent(boardId)}/invitations`,
      {
        data: {
          displayName: "Участник Undo",
          expiresAt: null,
          writeEnabled: true,
        },
        headers: { "x-csrf-token": csrf },
      },
    );
    expect(invited.ok()).toBe(true);
    const { joinUrl } = (await invited.json()) as { joinUrl: string };
    await teacher.goto(`/b/${encodeURIComponent(boardId)}#/board`);
    const guest = await guestContext.newPage();
    capturePageDiagnostics(guest);
    await guest.goto(joinUrl);
    await expectRevision(teacher, 0);
    await expectRevision(guest, 0);
    await expectCollaborationOnline(teacher);
    await expectCollaborationOnline(guest);

    await draw(teacher, "r", { x: 220, y: 180 }, { x: 360, y: 280 });
    await expectRevision(teacher, 1);
    await expectRevision(guest, 1);
    await draw(guest, "p", { x: 450, y: 200 }, { x: 550, y: 290 });
    await expectRevision(teacher, 2);
    await expectRevision(guest, 2);
    await expect(teacher.getByTestId("object-count")).toHaveText("2 объекта");

    await clearBoard(teacher);
    await teacher.keyboard.press("Control+z");
    await expectRevision(teacher, 4);
    await expectRevision(guest, 4);
    await expect(teacher.getByTestId("object-count")).toHaveText("2 объекта");
    await expect(guest.getByTestId("object-count")).toHaveText("2 объекта");

    await clearBoard(teacher);
    await expectRevision(teacher, 5);
    await expectRevision(guest, 5);
    await expect(guest.getByTestId("object-count")).toHaveText("0 объекта");
    await draw(guest, "r", { x: 600, y: 350 }, { x: 720, y: 430 });
    await expectRevision(teacher, 6);
    await expectRevision(guest, 6);
    await teacher.keyboard.press("Control+z");
    await expectRevision(teacher, 7);
    await expectRevision(guest, 7);
    await expect(teacher.getByTestId("object-count")).toHaveText("3 объекта");
    await expect(guest.getByTestId("object-count")).toHaveText("3 объекта");
    await teacher.reload();
    await guest.reload();
    await expectRevision(teacher, 7);
    await expectRevision(guest, 7);
    await expect(teacher.getByTestId("object-count")).toHaveText("3 объекта");
    await expect(guest.getByTestId("object-count")).toHaveText("3 объекта");
  } finally {
    await teacherContext.close();
    await guestContext.close();
  }
});
