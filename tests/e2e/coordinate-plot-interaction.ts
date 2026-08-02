import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

interface ExportedCoordinatePlotDocument {
  readonly objects: Readonly<
    Record<
      string,
      {
        readonly definition?: {
          readonly size: { readonly height: number; readonly width: number };
        };
        readonly kind?: string;
        readonly position: { readonly x: number; readonly y: number };
        readonly scale: { readonly x: number; readonly y: number };
      }
    >
  >;
  readonly viewport: {
    readonly offset: { readonly x: number; readonly y: number };
    readonly zoom: number;
  };
}

async function exportDocument(
  page: Page,
): Promise<ExportedCoordinatePlotDocument> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("Expected exported board document");
  return JSON.parse(
    await readFile(path, "utf8"),
  ) as ExportedCoordinatePlotDocument;
}

async function coordinatePlotClientCenter(page: Page) {
  const document = await exportDocument(page);
  const plot = Object.values(document.objects).find(
    ({ kind }) => kind === "math.coordinate-plot",
  );
  if (plot?.definition === undefined) {
    throw new Error("Expected coordinate plot in exported document");
  }
  const stageBounds = await page.getByTestId("board-stage").boundingBox();
  if (stageBounds === null) throw new Error("Expected TutorBoard stage bounds");
  return {
    x:
      stageBounds.x +
      document.viewport.offset.x +
      (plot.position.x + (plot.definition.size.width * plot.scale.x) / 2) *
        document.viewport.zoom,
    y:
      stageBounds.y +
      document.viewport.offset.y +
      (plot.position.y + (plot.definition.size.height * plot.scale.y) / 2) *
        document.viewport.zoom,
  };
}

async function dispatchRightClick(
  page: Page,
  point: { readonly x: number; readonly y: number },
  pointerId: number,
): Promise<void> {
  await page.evaluate(
    ({ clientX, clientY, id }) => {
      const target = document.elementFromPoint(clientX, clientY);
      if (target === null) throw new Error("Expected pointer target");
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 2,
          buttons: 2,
          cancelable: true,
          clientX,
          clientY,
          pointerId: id,
          pointerType: "mouse",
        }),
      );
      target.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          button: 2,
          buttons: 0,
          cancelable: true,
          clientX,
          clientY,
          pointerId: id,
          pointerType: "mouse",
        }),
      );
    },
    { clientX: point.x, clientY: point.y, id: pointerId },
  );
}

export async function openCoordinatePlotEditorByRightDoubleClick(
  page: Page,
): Promise<void> {
  const point = await coordinatePlotClientCenter(page);
  await dispatchRightClick(page, point, 41);
  await page.waitForTimeout(60);
  await dispatchRightClick(page, point, 42);
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeVisible();
}