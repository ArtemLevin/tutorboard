import { expect, test, type Page } from "@playwright/test";

interface MockBoard {
  archivedAt: string | null;
  boardId: string;
  createdAt: string;
  currentRevision: number;
  deletedAt: null;
  guestWritesEnabled: boolean;
  schemaVersion: "1.0";
  title: string;
  updatedAt: string;
}

interface MockInvitation {
  boardId: string;
  createdAt: string;
  displayName: string;
  expiresAt: string | null;
  invitationId: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  schemaVersion: "1.0";
  useCount: number;
  writeEnabled: boolean;
}

interface InstalledManagementApi {
  readonly requests: string[];
  readonly state: {
    boards: MockBoard[];
    invitations: Map<string, MockInvitation[]>;
  };
}

const now = "2026-08-16T16:00:00.000Z";
const teacherCsrf = "csrf-teacher-t2-e2e";
const initialBoardId = "board:t2-algebra";
const archivedBoardId = "board:t2-archive";
const initialInvitationId = "invite:t2-xenia";
const createdSecret = "http://127.0.0.1:4173/j/t2-created-secret-never-durable";
const rotatedSecret = "http://127.0.0.1:4173/j/t2-rotated-secret-never-durable";

function initialBoards(): MockBoard[] {
  return [
    {
      archivedAt: null,
      boardId: initialBoardId,
      createdAt: "2026-08-15T10:00:00.000Z",
      currentRevision: 12,
      deletedAt: null,
      guestWritesEnabled: true,
      schemaVersion: "1.0",
      title: "Алгебра",
      updatedAt: "2026-08-16T15:00:00.000Z",
    },
    {
      archivedAt: "2026-08-16T12:00:00.000Z",
      boardId: archivedBoardId,
      createdAt: "2026-08-14T10:00:00.000Z",
      currentRevision: 4,
      deletedAt: null,
      guestWritesEnabled: false,
      schemaVersion: "1.0",
      title: "Архивная геометрия",
      updatedAt: "2026-08-16T12:00:00.000Z",
    },
  ];
}

function initialInvitations(): Map<string, MockInvitation[]> {
  return new Map([
    [
      initialBoardId,
      [
        {
          boardId: initialBoardId,
          createdAt: "2026-08-16T13:00:00.000Z",
          displayName: "Ксения",
          expiresAt: "2026-08-23T13:00:00.000Z",
          invitationId: initialInvitationId,
          lastUsedAt: null,
          revokedAt: null,
          schemaVersion: "1.0",
          useCount: 0,
          writeEnabled: true,
        },
      ],
    ],
    [archivedBoardId, []],
  ]);
}

function decodedPath(url: URL): string {
  return decodeURIComponent(url.pathname);
}

async function installManagementApi(
  page: Page,
  principal: "guest" | "teacher" = "teacher",
): Promise<InstalledManagementApi> {
  const requests: string[] = [];
  const state = {
    boards: initialBoards(),
    invitations: initialInvitations(),
  };
  let invitationSequence = 0;

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = decodedPath(url);
    const method = request.method();
    requests.push(`${method} ${path}${url.search}`);

    if (path === "/api/v1/boards/context" && method === "GET") {
      if (principal === "guest") {
        await route.fulfill({
          json: {
            accessEpoch: "guest_epoch_t2_e2e",
            actorId: "guest:t2-e2e",
            boardId: initialBoardId,
            cacheScopeId: "guest_cache_t2_e2e",
            capabilities: ["board.read"],
            csrfToken: "guest_csrf_t2_e2e",
            displayName: "Ученик",
            principalType: "guest",
            role: "student",
            schemaVersion: "1.0",
          },
        });
        return;
      }
      await route.fulfill({
        json: {
          csrfToken: teacherCsrf,
          organizationId: "organization:t2-e2e",
          role: "tutor",
          userId: "user:teacher-t2-e2e",
        },
      });
      return;
    }

    const csrf = new Headers(request.headers()).get("x-csrf-token");
    if (method !== "GET") expect(csrf).toBe(teacherCsrf);

    if (path === "/api/v1/boards" && method === "GET") {
      await route.fulfill({ json: { items: state.boards } });
      return;
    }

    if (path === "/api/v1/boards" && method === "POST") {
      const payload = request.postDataJSON() as { title?: string };
      const board: MockBoard = {
        archivedAt: null,
        boardId: "board:t2-created",
        createdAt: now,
        currentRevision: 0,
        deletedAt: null,
        guestWritesEnabled: true,
        schemaVersion: "1.0",
        title: payload.title ?? "Новая доска",
        updatedAt: now,
      };
      state.boards = [board, ...state.boards];
      state.invitations.set(board.boardId, []);
      await route.fulfill({ json: board, status: 201 });
      return;
    }

    const invitationMatch = path.match(
      /^\/api\/v1\/boards\/(.+)\/invitations(?:\/([^/]+))?(?:\/(revoke|rotate))?$/u,
    );
    if (invitationMatch !== null) {
      const boardId = invitationMatch[1] ?? "";
      const invitationId = invitationMatch[2];
      const action = invitationMatch[3];
      const invitations = state.invitations.get(boardId) ?? [];

      if (method === "GET" && invitationId === undefined) {
        await route.fulfill({ json: { items: invitations } });
        return;
      }

      if (method === "POST" && invitationId === undefined) {
        const payload = request.postDataJSON() as {
          displayName: string;
          expiresAt: string | null;
          writeEnabled: boolean;
        };
        invitationSequence += 1;
        const invitation: MockInvitation = {
          boardId,
          createdAt: now,
          displayName: payload.displayName,
          expiresAt: payload.expiresAt,
          invitationId: `invite:t2-created-${invitationSequence}`,
          lastUsedAt: null,
          revokedAt: null,
          schemaVersion: "1.0",
          useCount: 0,
          writeEnabled: payload.writeEnabled,
        };
        state.invitations.set(boardId, [invitation, ...invitations]);
        await route.fulfill({
          json: { invitation, joinUrl: createdSecret },
          status: 201,
        });
        return;
      }

      const index = invitations.findIndex(
        (candidate) => candidate.invitationId === invitationId,
      );
      if (index < 0) {
        await route.fulfill({ json: { detail: "not found" }, status: 404 });
        return;
      }
      const current = invitations[index]!;

      if (method === "PATCH" && action === undefined) {
        const payload = request.postDataJSON() as Partial<
          Pick<MockInvitation, "displayName" | "expiresAt" | "writeEnabled">
        >;
        const updated = { ...current, ...payload };
        invitations[index] = updated;
        await route.fulfill({ json: updated });
        return;
      }

      if (method === "POST" && action === "revoke") {
        const updated = { ...current, revokedAt: now };
        invitations[index] = updated;
        await route.fulfill({ json: updated });
        return;
      }

      if (method === "POST" && action === "rotate") {
        const updated = { ...current, revokedAt: null };
        invitations[index] = updated;
        await route.fulfill({
          json: { invitation: updated, joinUrl: rotatedSecret },
        });
        return;
      }
    }

    const archiveMatch = path.match(
      /^\/api\/v1\/boards\/(.+)\/(archive|unarchive)$/u,
    );
    if (archiveMatch !== null && method === "POST") {
      const boardId = archiveMatch[1] ?? "";
      const action = archiveMatch[2];
      const index = state.boards.findIndex(
        (board) => board.boardId === boardId,
      );
      const current = state.boards[index]!;
      const updated = {
        ...current,
        archivedAt: action === "archive" ? now : null,
        updatedAt: now,
      };
      state.boards[index] = updated;
      await route.fulfill({ json: updated });
      return;
    }

    const boardMatch = path.match(/^\/api\/v1\/boards\/(.+)$/u);
    if (boardMatch !== null) {
      const boardId = boardMatch[1] ?? "";
      const index = state.boards.findIndex(
        (board) => board.boardId === boardId,
      );
      if (index < 0) {
        await route.fulfill({ json: { detail: "not found" }, status: 404 });
        return;
      }
      if (method === "PATCH") {
        const payload = request.postDataJSON() as Partial<
          Pick<MockBoard, "guestWritesEnabled" | "title">
        >;
        const updated = { ...state.boards[index]!, ...payload, updatedAt: now };
        state.boards[index] = updated;
        await route.fulfill({ json: updated });
        return;
      }
      if (method === "DELETE") {
        state.boards.splice(index, 1);
        await route.fulfill({ status: 204 });
        return;
      }
    }

    await route.fulfill({
      json: { detail: `Unexpected API call ${method} ${path}` },
      status: 500,
    });
  });

  return { requests, state };
}

async function expectSecretAbsentFromDurableBrowserState(
  page: Page,
  secret: string,
) {
  const serialized = await page.evaluate(() =>
    JSON.stringify({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
    }),
  );
  expect(serialized).not.toContain(secret);
}

test("teacher can create a board using the keyboard-only primary flow", async ({
  page,
}) => {
  await installManagementApi(page);
  await page.goto("/boards");
  await expect(page.getByRole("heading", { name: "Мои доски" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "+ Создать доску" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const title = page.getByRole("textbox", { name: "Название" });
  await expect(title).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Геометрия 10 класс");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/b\/board%3At2-created#\/board$/u);
});

test("teacher manages transient invitation links, expiry and read/write policy", async ({
  page,
}) => {
  const api = await installManagementApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("clipboard denied for test")),
      },
    });
  });
  await page.goto("/boards");

  const algebraCard = page.locator("article.teacher-board-card").filter({
    hasText: "Алгебра",
  });
  await expect(algebraCard.getByText("1", { exact: true })).toBeVisible();
  await algebraCard.getByRole("button", { name: "Доступ и ссылки" }).click();

  const dialog = page.getByRole("dialog", { name: "Алгебра" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Имя ученика" })
    .first()
    .fill("София");
  await dialog.getByLabel("Срок действия").selectOption("7d");
  await dialog
    .getByRole("checkbox", { name: "Разрешить ученику редактировать доску" })
    .uncheck();
  await dialog.getByRole("button", { name: "Создать гостевую ссылку" }).click();

  const secretInput = dialog.getByRole("textbox", { name: "Гостевая ссылка" });
  await expect(secretInput).toHaveValue(createdSecret);
  await dialog.getByRole("button", { name: "Скопировать ссылку" }).click();
  await expect(
    dialog.getByText(
      "Буфер обмена недоступен. Ссылка выделена — скопируйте её вручную.",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Скрыть ссылку" }).click();
  await expect(secretInput).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(createdSecret);
  await expectSecretAbsentFromDurableBrowserState(page, createdSecret);

  const xeniaRow = dialog
    .locator("article.invitation-row")
    .filter({ hasText: "Ксения" });
  await xeniaRow
    .getByRole("checkbox", { name: "Разрешить редактирование" })
    .uncheck();
  await expect
    .poll(
      () =>
        api.state.invitations.get(initialBoardId)?.[1]?.writeEnabled ??
        api.state.invitations.get(initialBoardId)?.[0]?.writeEnabled,
    )
    .toBe(false);

  await xeniaRow
    .getByRole("button", { name: "Ротировать и получить новую ссылку" })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Гостевая ссылка" }),
  ).toHaveValue(rotatedSecret);
  await dialog.getByRole("button", { name: "Скрыть ссылку" }).click();
  await xeniaRow.getByRole("button", { name: "Отозвать" }).click();
  await expect(xeniaRow.getByText("Отозвана")).toBeVisible();

  await dialog
    .getByRole("button", { name: "Закрыть управление доступом" })
    .click();
  await algebraCard
    .getByRole("checkbox", {
      name: "Разрешать запись гостям, у которых она включена в ссылке",
    })
    .uncheck();
  await expect(algebraCard.getByText("Только чтение")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(rotatedSecret);
  await expectSecretAbsentFromDurableBrowserState(page, rotatedSecret);
});

test("teacher can rename, archive, restore and soft-delete a board", async ({
  page,
}) => {
  await installManagementApi(page);
  await page.goto("/boards");

  let algebraCard = page
    .locator("article.teacher-board-card")
    .filter({ hasText: "Алгебра" });
  await algebraCard.getByRole("button", { name: "Переименовать" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Переименовать" });
  const renameInput = renameDialog.getByRole("textbox", { name: "Название" });
  await renameInput.fill("Алгебра — параметры");
  await renameDialog.getByRole("button", { name: "Сохранить" }).click();
  algebraCard = page.locator("article.teacher-board-card").filter({
    hasText: "Алгебра — параметры",
  });
  await expect(algebraCard).toBeVisible();

  await algebraCard.getByRole("button", { name: "В архив" }).click();
  await expect(algebraCard).toHaveCount(0);
  await page.getByRole("button", { name: /Архив/u }).click();
  algebraCard = page.locator("article.teacher-board-card").filter({
    hasText: "Алгебра — параметры",
  });
  await expect(algebraCard).toBeVisible();
  await algebraCard.getByRole("button", { name: "Восстановить" }).click();
  await expect(algebraCard).toHaveCount(0);

  await page.getByRole("button", { name: /Активные/u }).click();
  algebraCard = page.locator("article.teacher-board-card").filter({
    hasText: "Алгебра — параметры",
  });
  await algebraCard.getByRole("button", { name: "Удалить" }).click();
  await algebraCard.getByRole("button", { name: "Да, удалить" }).click();
  await expect(algebraCard).toHaveCount(0);
});

test("guest principal cannot mount or call teacher management controls", async ({
  page,
}) => {
  const api = await installManagementApi(page, "guest");
  await page.goto("/boards");

  await expect(
    page.getByRole("heading", { name: "Управление досками недоступно" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Создать доску" }),
  ).toHaveCount(0);
  expect(
    api.requests.filter((entry) => !entry.includes("/boards/context")),
  ).toEqual([]);
});
