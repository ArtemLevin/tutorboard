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

interface ClientRectBounds {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
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

async function coordinatePlotClientBounds(
  page: Page,
): Promise<ClientRectBounds> {
  const document = await exportDocument(page);
  const plot = Object.values(document.objects).find(
    ({ kind }) => kind === "math.coordinate-plot",
  );
  if (plot?.definition === undefined) {
    throw new Error("Expected coordinate plot in exported document");
  }
  const stageBounds = await page.getByTestId("board-stage").boundingBox();
  if (stageBounds === null) throw new Error("Expected TutorBoard stage bounds");
  const left =
    stageBounds.x +
    document.viewport.offset.x +
    plot.position.x * document.viewport.zoom;
  const top =
    stageBounds.y +
    document.viewport.offset.y +
    plot.position.y * document.viewport.zoom;
  return {
    bottom:
      top +
      plot.definition.size.height * plot.scale.y * document.viewport.zoom,
    left,
    right:
      left +
      plot.definition.size.width * plot.scale.x * document.viewport.zoom,
    top,
  };
}

async function dispatchRightClick(
  page: Page,
  plotBounds: ClientRectBounds,
  pointerId: number,
): Promise<void> {
  await page.evaluate(
    ({ bounds, id }) => {
      const container = document.querySelector<HTMLElement>(".konvajs-content");
      if (container === null) throw new Error("Expected Konva stage container");
      const canvasBounds = container.getBoundingClientRect();
      const left = Math.max(bounds.left, canvasBounds.left);
      const right = Math.min(bounds.right, canvasBounds.right);
      const top = Math.max(bounds.top, canvasBounds.top);
      const bottom = Math.min(bounds.bottom, canvasBounds.bottom);
      if (!(left < right) || !(top < bottom)) {
        throw new Error("Expected a visible coordinate plot area");
      }
      const clientX = left + (right - left) * 0.5;
      const clientY = top + (bottom - top) * 0.65;
      for (const [type, buttons] of [
        ["pointerdown", 2],
        ["pointerup", 0],
      ] as const) {
        container.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            button: 2,
            buttons,
            cancelable: true,
            clientX,
            clientY,
            pointerId: id,
            pointerType: "mouse",
          }),
        );
      }
    },
    { bounds: plotBounds, id: pointerId },
  );
}

export async function openCoordinatePlotEditorByRightDoubleClick(
  page: Page,
): Promise<void> {
  const plotBounds = await coordinatePlotClientBounds(page);
  await dispatchRightClick(page, plotBounds, 41);
  await page.waitForTimeout(60);
  await dispatchRightClick(page, plotBounds, 42);
  await expect(
    page.getByRole("complementary", {
      name: "Редактор координатной плоскости",
    }),
  ).toBeVisible();
}