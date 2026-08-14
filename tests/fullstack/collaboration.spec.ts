import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const lessonId = "20000000-0000-4000-8000-000000000001";
const password = "collaboration-e2e-password";

async function login(context: BrowserContext, email: string): Promise<void> {
  const loginPage = await context.request.get("/login");
  expect(loginPage.ok()).toBe(true);
  const html = await loginPage.text();
  const csrf = html.match(/name="csrf_token" value="([^"]+)"/)?.[1];
  if (csrf === undefined) throw new Error("Login CSRF token is missing");
  const response = await context.request.post("/login", {
    failOnStatusCode: false,
    form: {
      csrf_token: csrf,
      email,
      next: "/",
      password,
    },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

async function openBoard(page: Page, documentId: string): Promise<void> {
  await page.goto(
    `/?lessonId=${encodeURIComponent(lessonId)}&documentId=${encodeURIComponent(documentId)}#/board`,
  );
  await expect(page.getByTestId("persistence-status")).toHaveText(
    /Синхронизировано · r\d+/,
  );
}

async function draw(
  page: Page,
  key: "p" | "r",
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  beforeRelease?: () => Promise<void>,
): Promise<void> {
  await page.keyboard.press(key);
  const bounds = await page.getByTestId("board-stage").boundingBox();
  if (bounds === null) throw new Error("Board stage has no bounds");
  await page.mouse.move(bounds.x + start.x, bounds.y + start.y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + end.x, bounds.y + end.y, { steps: 8 });
  await beforeRelease?.();
  await page.mouse.up();
}

test("tutor and student share live previews, revisions, and reconnect recovery", async ({
  browser,
}, testInfo) => {
  const documentId = `document:${lessonId}:attempt-${testInfo.retry}`;
  const tutorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  try {
    await login(tutorContext, "collaboration-tutor@example.test");
    await login(studentContext, "collaboration-student@example.test");
    const tutor = await tutorContext.newPage();
    const student = await studentContext.newPage();

    await openBoard(tutor, documentId);
    await openBoard(student, documentId);
    await tutor.getByRole("button", { name: "Настройки доски" }).click();
    await expect(tutor.getByText("В комнате 2")).toBeVisible();
    await tutor.keyboard.press("Escape");

    await draw(tutor, "p", { x: 360, y: 220 }, { x: 540, y: 300 }, async () => {
      await expect(student.getByTestId("board-stage")).toHaveAttribute(
        "data-remote-ink-count",
        "1",
      );
      await expect(student.getByTestId("object-count")).toHaveText("0 объекта");
    });
    await expect(tutor.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r1",
    );
    await expect(student.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r1",
    );
    await expect(student.getByTestId("object-count")).toHaveText("1 объекта");

    await studentContext.setOffline(true);
    await expect(student.getByTestId("persistence-status")).toHaveText(
      "Автономный режим",
    );
    await draw(tutor, "r", { x: 260, y: 360 }, { x: 410, y: 450 });
    await expect(tutor.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r2",
    );
    await expect(student.getByTestId("object-count")).toHaveText("1 объекта");

    await studentContext.setOffline(false);
    await expect(student.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r2",
    );
    await expect(student.getByTestId("object-count")).toHaveText("2 объекта");

    await draw(
      student,
      "p",
      { x: 620, y: 180 },
      { x: 680, y: 340 },
      async () => {
        await expect(tutor.getByTestId("board-stage")).toHaveAttribute(
          "data-remote-ink-count",
          "1",
        );
      },
    );
    await expect(tutor.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r3",
    );
    await expect(tutor.getByTestId("object-count")).toHaveText("3 объекта");
  } finally {
    await tutorContext.close();
    await studentContext.close();
  }
});
