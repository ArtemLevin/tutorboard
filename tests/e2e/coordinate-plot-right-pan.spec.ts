import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction";

import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

interface ExportedPlotDocument {
  readonly objects: Readonly<
    Record<
      string,
      {
        readonly definition?: {
          readonly coordinateViewport: {
            readonly xMin: number;
          };
          readonly size: { readonly height: number; readonly width: number };
        };
        readonly kind?: string;
        readonly position: { readonly x: number; readonly y: number };
      }
    >
  >;
  readonly viewport: {
    readonly offset: { readonly x: number; readonly y: number };
    readonly zoom: number;
  };
}

async function exportDocument(page: Page): Promise<ExportedPlotDocument> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("Expected exported board document");
  return JSON.parse(await readFile(path, "utf8")) as ExportedPlotDocument;
}

function coordinatePlot(document: ExportedPlotDocument) {
  const entry = Object.values(document.objects).find(
    ({ kind }) => kind === "math.coordinate-plot",
  );
  if (entry?.definition === undefined) {
    throw new Error("Expected coordinate plot in exported document");
  }
  return entry;
}

test("right-button drag pans the active graph while the board stays fixed", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  await openCoordinatePlotEditorByRightDoubleClick(page);
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeVisible();

  const before = await exportDocument(page);
  const beforePlot = coordinatePlot(before);
  await page.getByRole("tab", { name: "Вид" }).click();
  const minimumX = page.getByLabel("Минимальная граница X");
  const initialMinimumX = Number(await minimumX.inputValue());
  const stageBox = await page.getByTestId("board-stage").boundingBox();
  if (stageBox === null) throw new Error("Expected board stage bounds");

  const localPoint = {
    x: beforePlot.definition!.size.width * 0.25,
    y: beforePlot.definition!.size.height * 0.6,
  };
  const start = {
    x:
      stageBox.x +
      before.viewport.offset.x +
      (beforePlot.position.x + localPoint.x) * before.viewport.zoom,
    y:
      stageBox.y +
      before.viewport.offset.y +
      (beforePlot.position.y + localPoint.y) * before.viewport.zoom,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(start.x + 96, start.y + 48, { steps: 8 });
  await page.mouse.up({ button: "right" });

  await expect
    .poll(async () => Number(await minimumX.inputValue()))
    .not.toBe(initialMinimumX);
  const draftMinimumX = Number(await minimumX.inputValue());
  await page.getByRole("button", { name: "Сохранить" }).click();
  const after = await exportDocument(page);
  const afterPlot = coordinatePlot(after);

  expect(after.viewport).toEqual(before.viewport);
  expect(afterPlot.position).toEqual(beforePlot.position);
  expect(afterPlot.definition!.coordinateViewport.xMin).toBeCloseTo(
    draftMinimumX,
    8,
  );
});
