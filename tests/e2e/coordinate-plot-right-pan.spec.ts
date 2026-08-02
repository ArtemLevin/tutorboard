import { openCoordinatePlotEditorByRightDoubleClick } from "./coordinate-plot-interaction.js";

import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

interface ExportedPlotDocument {
  readonly objects: Readonly<
    Record<
      string,
      {
        readonly definition?: {
          readonly coordinateViewport: {
            readonly equalScale: boolean;
            readonly xMax: number;
            readonly xMin: number;
            readonly yMax: number;
            readonly yMin: number;
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

function plotScreenPoint(document: ExportedPlotDocument) {
  const plot = coordinatePlot(document);
  return {
    x:
      document.viewport.offset.x +
      (plot.position.x + plot.definition.size.width * 0.3) *
        document.viewport.zoom,
    y:
      document.viewport.offset.y +
      (plot.position.y + plot.definition.size.height * 0.6) *
        document.viewport.zoom,
  };
}

test("right-button drag pans a closed graph as one history item while the board stays fixed", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeHidden();

  const before = await exportDocument(page);
  const beforePlot = coordinatePlot(before);
  const stageBox = await page.getByTestId("board-stage").boundingBox();
  if (stageBox === null) throw new Error("Expected board stage bounds");
  const local = plotScreenPoint(before);
  const start = { x: stageBox.x + local.x, y: stageBox.y + local.y };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(start.x + 96, start.y + 48, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await expect(page.getByTestId("history-depth")).toHaveText("2/0");

  const after = await exportDocument(page);
  const afterPlot = coordinatePlot(after);
  expect(after.viewport).toEqual(before.viewport);
  expect(afterPlot.position).toEqual(beforePlot.position);
  expect(afterPlot.definition.coordinateViewport.xMin).not.toBe(
    beforePlot.definition.coordinateViewport.xMin,
  );

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("history-depth")).toHaveText("1/1");
  const undone = await exportDocument(page);
  expect(coordinatePlot(undone).definition.coordinateViewport).toEqual(
    beforePlot.definition.coordinateViewport,
  );
});

test("single right click keeps the active tool and double click opens graph settings", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Создать координатную плоскость (G)" })
    .click();
  await page.getByRole("button", { name: "Прямоугольник (R)" }).click();
  const document = await exportDocument(page);
  const stageBox = await page.getByTestId("board-stage").boundingBox();
  if (stageBox === null) throw new Error("Expected board stage bounds");
  const local = plotScreenPoint(document);
  const point = { x: stageBox.x + local.x, y: stageBox.y + local.y };

  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(
    page.getByRole("button", { name: "Прямоугольник (R)" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeHidden();

  await openCoordinatePlotEditorByRightDoubleClick(page, point);
});
