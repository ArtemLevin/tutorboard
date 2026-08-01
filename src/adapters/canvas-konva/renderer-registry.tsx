import type { ReactElement } from "react";

import type {
  BoardObject,
  BoardObjectId,
  BoardObjectKind,
  BoardRenderItem,
  CoordinatePlotDefinition,
  CoordinatePlotViewport,
  PlotSeriesId,
} from "../../core/public";

export interface CoordinatePlotRenderInteraction {
  readonly activeObjectId: BoardObjectId | null;
  readonly definitionOverride?: CoordinatePlotDefinition | undefined;
  readonly onEditRequest?: ((objectId: BoardObjectId) => void) | undefined;
  readonly onSelectedSeriesChange?:
    | ((objectId: BoardObjectId, seriesId: PlotSeriesId | null) => void)
    | undefined;
  readonly onViewportChange?:
    | ((objectId: BoardObjectId, viewport: CoordinatePlotViewport) => void)
    | undefined;
  readonly selectedSeriesId: PlotSeriesId | null;
}

export interface KonvaRenderContext {
  readonly coordinatePlot?: CoordinatePlotRenderInteraction | undefined;
  readonly zoom: number;
}

export interface KonvaObjectRenderer {
  readonly kind: BoardObjectKind;
  render(object: BoardObject, context: KonvaRenderContext): ReactElement;
}

export class KonvaRendererRegistry {
  readonly #renderers: ReadonlyMap<BoardObjectKind, KonvaObjectRenderer>;

  constructor(renderers: readonly KonvaObjectRenderer[]) {
    const byKind = new Map<BoardObjectKind, KonvaObjectRenderer>();

    for (const renderer of renderers) {
      if (byKind.has(renderer.kind)) {
        throw new Error(`Duplicate Konva renderer for ${renderer.kind}.`);
      }
      byKind.set(renderer.kind, renderer);
    }

    this.#renderers = byKind;
  }

  render(
    item: BoardRenderItem,
    context: KonvaRenderContext = { zoom: 1 },
  ): ReactElement {
    const renderer = this.#renderers.get(item.object.kind);
    if (renderer === undefined) {
      throw new Error(`Missing Konva renderer for ${item.object.kind}.`);
    }

    return renderer.render(item.object, context);
  }
}
