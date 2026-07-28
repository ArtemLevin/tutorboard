import { expect, test, type Page } from "@playwright/test";
import snapshotFixture from "../../contracts/board/v1/fixtures/board-snapshot.json" with { type: "json" };

const documentId = "document:lesson-01";
const lessonId = "lesson:lesson-01";

interface CapturedEnvelope {
  readonly actorId: string;
  readonly baseRevision: number;
  readonly commands: readonly Record<string, unknown>[];
  readonly documentId: string;
  readonly expectedDocumentSha256: string;
  readonly idempotencyKey: string;
  readonly schemaVersion: "1.0";
}

async function installBoardApi(page: Page) {
  let accepted: CapturedEnvelope | null = null;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = decodeURIComponent(url.pathname);
    const currentRevision = accepted === null ? 7 : 8;
    const descriptor = {
      currentDocumentSha256:
        accepted?.expectedDocumentSha256 ?? snapshotFixture.documentSha256,
      currentRevision,
      documentId,
      lastSnapshotRevision: 7,
      lessonId,
      snapshotDue: false,
      studentId: "student:lesson-01",
    };
    if (pathname === "/api/v1/boards/context") {
      await route.fulfill({
        json: {
          csrfToken: "csrf-e2e",
          organizationId: "organization:e2e",
          role: "tutor",
          userId: "actor:tutor-01",
        },
      });
      return;
    }
    if (
      pathname === `/api/v1/lessons/${lessonId}/board` &&
      request.method() === "POST"
    ) {
      await route.fulfill({ json: descriptor, status: 200 });
      return;
    }
    if (
      pathname === `/api/v1/boards/${documentId}` &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: {
          board: descriptor,
          commandBatches:
            accepted === null
              ? []
              : [
                  {
                    actorUserId: accepted.actorId,
                    baseRevision: 7,
                    createdAt: "2026-07-28T18:10:00.000Z",
                    envelope: accepted,
                    idempotencyKey: accepted.idempotencyKey,
                    payloadSha256:
                      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    revision: 8,
                  },
                ],
          snapshot: snapshotFixture,
        },
      });
      return;
    }
    if (
      pathname === `/api/v1/boards/${documentId}/commands` &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        json: {
          currentRevision,
          documentId,
          hasMore: false,
          items: [],
        },
      });
      return;
    }
    if (
      pathname === `/api/v1/boards/${documentId}/commands` &&
      request.method() === "POST"
    ) {
      accepted = request.postDataJSON() as CapturedEnvelope;
      await route.fulfill({
        json: {
          currentDocumentSha256: accepted.expectedDocumentSha256,
          documentId,
          revision: 8,
          snapshotDue: false,
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        detail: `Unexpected board API route: ${request.method()} ${pathname}`,
      },
      status: 500,
    });
  });
  return () => accepted;
}

test("keeps a local command offline, reconnects, and restores the confirmed revision", async ({
  context,
  page,
}) => {
  const accepted = await installBoardApi(page);
  await page.goto(
    `/?lessonId=${encodeURIComponent(lessonId)}&documentId=${encodeURIComponent(documentId)}#/board`,
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Синхронизировано · r7",
  );
  await expect(page.getByTestId("object-count")).toHaveText("2 объекта");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const stage = page.getByTestId("board-stage");
  const bounds = await stage.boundingBox();
  if (bounds === null) {
    throw new Error("Canvas has no bounds.");
  }
  await page.mouse.move(bounds.x + 620, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 730, bounds.y + 260, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("object-count")).toHaveText("3 объекта");
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Автономно · в очереди 1",
  );

  await context.setOffline(false);
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Синхронизировано · r8",
  );
  expect(accepted()?.baseRevision).toBe(7);
  expect(accepted()?.commands).toHaveLength(1);

  await page.reload();
  await expect(page.getByTestId("persistence-status")).toHaveText(
    "Синхронизировано · r8",
  );
  await expect(page.getByTestId("object-count")).toHaveText("3 объекта");
});
