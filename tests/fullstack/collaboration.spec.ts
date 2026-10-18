import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { rightDoubleClickAt } from "../e2e/coordinate-plot-interaction.js";

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

test("two clients edit styled text and recover persisted content after reconnect", async ({
  browser,
}, testInfo) => {
  const documentId = `document:${lessonId}:typography-${testInfo.retry}`;
  const tutorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const original = "Первая длинная строка для совместной работы";
  const updated = "Учитель изменил длинный текст после отключения ученика";
  const finalText = "Ученик подтвердил и дополнил общую запись";

  try {
    await login(tutorContext, "collaboration-tutor@example.test");
    await login(studentContext, "collaboration-student@example.test");
    const tutor = await tutorContext.newPage();
    const student = await studentContext.newPage();
    await openBoard(tutor, documentId);
    await openBoard(student, documentId);

    await tutor.keyboard.press("t");
    await tutor.getByRole("spinbutton", { name: "Размер шрифта" }).fill("18");
    await tutor.getByRole("combobox", { name: "Семейство шрифта" }).selectOption("serif");
    await tutor.getByRole("button", { name: "Полужирный текст" }).click();
    const bounds = await tutor.getByTestId("board-stage").boundingBox();
    if (bounds === null) throw new Error("Board stage has no bounds");
    const point = { x: bounds.x + 370, y: bounds.y + 250 };
    await tutor.mouse.click(point.x, point.y);
    const editor = tutor.getByRole("textbox", {
      name: "Редактор текста на доске",
    });
    await editor.fill(original);
    await editor.press("Shift+Enter");

    await expect(tutor.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r1",
    );
    await expect(student.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r1",
    );
    await expect(student.getByTestId("object-count")).toHaveText("1 объекта");

    // Force the student offline while the tutor updates the same object.
    await studentContext.setOffline(true);
    await expect(student.getByTestId("persistence-status")).toHaveText(
      "Автономный режим",
    );
    await tutor.keyboard.press("v");
    await rightDoubleClickAt(tutor, point);
    const tutorEditor = tutor.getByRole("textbox", {
      name: "Редактор выбранного текста",
    });
    await expect(tutorEditor).toHaveValue(original);
    await tutorEditor.fill(updated);
    await tutorEditor.press("Shift+Enter");
    await expect(tutor.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r2",
    );
    await expect(student.getByTestId("object-count")).toHaveText("1 объекта");

    await studentContext.setOffline(false);
    await expect(student.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r2",
    );
    await student.reload();
    await expect(student.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r2",
    );
    await student.keyboard.press("v");
    await rightDoubleClickAt(student, point);
    const studentEditor = student.getByRole("textbox", {
      name: "Редактор выбранного текста",
    });
    await expect(studentEditor).toHaveValue(updated);

    // A second actor edits the synchronized text and publishes a new revision.
    await studentEditor.fill(finalText);
    await studentEditor.press("Shift+Enter");
    await expect(student.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r3",
    );
    await expect(tutor.getByTestId("persistence-status")).toHaveText(
      "Синхронизировано · r3",
    );
    await expect(tutor.getByRole("textbox", {
      name: "Редактор выбранного текста",
    })).toHaveValue(finalText);

    // Read the canonical server journal, including original style metadata.
    const response = await studentContext.request.get(
      `/api/v1/boards/${encodeURIComponent(documentId)}/commands?afterRevision=0`,
    );
    expect(response.ok()).toBe(true);
    const journal = JSON.stringify(await response.json());
    expect(journal).toContain(original);
    expect(journal).toContain(updated);
    expect(journal).toContain(finalText);
    expect(journal).toContain('"fontFamily":"serif"');
    expect(journal).toContain('"fontSize":18');
    expect(journal).toContain('"fontWeight":"bold"');
  } finally {
    await tutorContext.close();
    await studentContext.close();
  }
});
