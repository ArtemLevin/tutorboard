import { expect, test, type Page } from "@playwright/test";

const boardId = "document:lesson-01";
const createdAt = "2026-08-16T12:00:00.000Z";
const guestCsrf = "csrf-guest-never-durable-standalone";
const guestTicket = "ws-ticket-never-durable-standalone";

interface InstalledApi {
  readonly requests: string[];
}

function descriptor() {
  return {
    archivedAt: null,
    createdAt,
    currentDocumentSha256: "",
    currentRevision: 0,
    documentId: boardId,
    lastSnapshotRevision: 0,
    lessonId: null,
    snapshotDue: false,
    studentId: null,
    updatedAt: createdAt,
  };
}

async function installStandaloneApi(
  page: Page,
  principal: "guest" | "teacher" | "unavailable",
): Promise<InstalledApi> {
  const requests: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = decodeURIComponent(url.pathname);
    requests.push(`${request.method()} ${pathname}${url.search}`);

    if (pathname === "/api/v1/boards/context") {
      expect(url.searchParams.get("boardId")).toBe(boardId);
      if (principal === "unavailable") {
        await route.fulfill({
          json: {
            code: "board_not_found",
            detail: "Board is unavailable.",
            status: 404,
            title: "Board unavailable",
            type: "about:blank",
          },
          status: 404,
        });
        return;
      }
      if (principal === "guest") {
        await route.fulfill({
          json: {
            accessEpoch: "epoch:guest:e2e-01",
            actorId: "guest:e2e-01",
            boardId,
            cacheScopeId: "scope:guest:e2e-01",
            capabilities: ["board.read", "collaboration.connect"],
            csrfToken: guestCsrf,
            displayName: "Ксения",
            principalType: "guest",
            role: "student",
            schemaVersion: "1.0",
          },
        });
        return;
      }
      await route.fulfill({
        json: {
          accessEpoch: "epoch:teacher:e2e-01",
          actorId: "user:teacher-e2e-01",
          boardId,
          cacheScopeId: "scope:teacher:e2e-01",
          capabilities: [
            "board.read",
            "board.write",
            "board.snapshot.write",
            "collaboration.connect",
            "board.export",
            "board.history.read",
            "board.invites.manage",
            "board.archive",
            "board.delete",
          ],
          csrfToken: "csrf-teacher-e2e-01",
          displayName: "Артём Александрович",
          organizationId: "organization:e2e",
          principalType: "teacher",
          role: "tutor",
          schemaVersion: "1.0",
          userId: "user:teacher-e2e-01",
        },
      });
      return;
    }

    if (pathname === `/api/v1/boards/${boardId}` && request.method() === "GET") {
      await route.fulfill({
        json: { board: descriptor(), commandBatches: [], snapshot: null },
      });
      return;
    }

    if (
      pathname === `/api/v1/boards/${boardId}/commands` &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: {
          currentRevision: 0,
          documentId: boardId,
          hasMore: false,
          items: [],
        },
      });
      return;
    }

    if (
      pathname === `/api/v1/boards/${boardId}/snapshots` &&
      request.method() === "POST"
    ) {
      expect(principal).toBe("teacher");
      expect(new Headers(request.headers()).has("x-board-access-epoch")).toBe(false);
      const payload = request.postDataJSON() as { documentSha256: string };
      await route.fulfill({
        json: {
          documentId: boardId,
          revision: 0,
          sha256: payload.documentSha256,
          size: 1024,
          status: "ready",
        },
        status: 201,
      });
      return;
    }

    if (
      pathname === `/api/v1/boards/${boardId}/collaboration-ticket` &&
      request.method() === "POST"
    ) {
      if (principal === "guest") {
        expect(new Headers(request.headers()).get("x-board-access-epoch")).toBe(
          "epoch:guest:e2e-01",
        );
      }
      await route.fulfill({
        json: {
          expiresInSeconds: 30,
          protocolVersion: "1.1",
          ticket: principal === "guest" ? guestTicket : "teacher-ticket-e2e",
          websocketPath: `/api/v1/boards/${boardId}/collaboration`,
        },
      });
      return;
    }

    await route.fulfill({
      json: { detail: `Unexpected API call ${request.method()} ${pathname}` },
      status: 500,
    });
  });
  return { requests };
}

async function durableBrowserData(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const local = { ...localStorage };
    const open = indexedDB.open("tutorboard-sync-v1");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    try {
      const names = Array.from(database.objectStoreNames);
      if (names.length === 0) return JSON.stringify({ local });
      const transaction = database.transaction(names, "readonly");
      const stores = await Promise.all(
        names.map(
          (name) =>
            new Promise<[string, unknown[]]>((resolve, reject) => {
              const request = transaction.objectStore(name).getAll();
              request.onerror = () => reject(request.error);
              request.onsuccess = () => resolve([name, request.result]);
            }),
        ),
      );
      return JSON.stringify({ local, stores: Object.fromEntries(stores) });
    } finally {
      database.close();
    }
  });
}

test("opens a read-only guest board through the canonical standalone route", async ({
  page,
}) => {
  const api = await installStandaloneApi(page, "guest");
  await page.goto(`/b/${encodeURIComponent(boardId)}#/documents`);

  await expect(page).toHaveURL(
    new RegExp(`/b/${encodeURIComponent(boardId)}#/board$`),
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Синхронизировано · r0",
  );
  await expect(page.getByTestId("object-count")).toHaveText("0 объектов");
  expect(api.requests.some((entry) => entry.includes("/snapshots"))).toBe(false);
  expect(api.requests.some((entry) => entry.includes("/client-events"))).toBe(false);
  expect(api.requests.some((entry) => entry.includes("/board-evidence"))).toBe(false);
  expect(api.requests.some((entry) => entry.includes("/lessons/"))).toBe(false);

  await page.getByRole("button", { name: "Настройки доски" }).click();
  await expect(page.getByText("Ученик · Ксения")).toBeVisible();
  await expect(page.getByText("Режим только для чтения")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Сохранить PDF" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Копировать ссылку на доску" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Все документы" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Настройки приложения" }),
  ).toHaveCount(0);

  const durable = await durableBrowserData(page);
  expect(durable).not.toContain(guestCsrf);
  expect(durable).not.toContain(guestTicket);
});

test("opens the same standalone document for a teacher with teacher capabilities", async ({
  page,
}) => {
  const api = await installStandaloneApi(page, "teacher");
  await page.goto(`/b/${encodeURIComponent(boardId)}#/board`);

  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Синхронизировано · r0",
  );
  expect(api.requests.some((entry) => entry.includes("/snapshots"))).toBe(true);
  expect(api.requests.some((entry) => entry.includes("/client-events"))).toBe(false);

  await page.getByRole("button", { name: "Настройки доски" }).click();
  await expect(
    page.getByText("Преподаватель · Артём Александрович"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Все документы" })).toHaveCount(0);
});

test("renders a non-enumerating access failure and never loads the board", async ({
  page,
}) => {
  const api = await installStandaloneApi(page, "unavailable");
  await page.goto(`/b/${encodeURIComponent(boardId)}#/board`);

  await expect(
    page.getByRole("heading", { name: "Доступ к доске недоступен" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(boardId);
  expect(
    api.requests.some(
      (entry) =>
        entry.startsWith("GET /api/v1/boards/") &&
        !entry.includes("/context"),
    ),
  ).toBe(false);
});
