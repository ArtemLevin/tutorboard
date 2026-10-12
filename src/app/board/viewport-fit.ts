import type {
  BoardObjectId,
  BoardSceneReadModel,
  Size2,
  ViewportState,
} from "../../core/public";
import {
  aggregateSelectionBounds,
  selectSelectionBounds,
  type Rect2,
} from "../../modules/selection/public";

export const boardFitPaddingPx = 48;
export const boardFitZoomBounds = { minimum: 0.1, maximum: 8 } as const;

export function fitBoardViewport(
  bounds: Rect2 | null,
  viewportSize: Size2,
): ViewportState | null {
  if (
    bounds === null ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    !Number.isFinite(viewportSize.width) ||
    !Number.isFinite(viewportSize.height) ||
    bounds.width < 0 ||
    bounds.height < 0 ||
    viewportSize.width <= 0 ||
    viewportSize.height <= 0
  ) {
    return null;
  }

  const padding = Math.min(
    boardFitPaddingPx,
    viewportSize.width / 6,
    viewportSize.height / 6,
  );
  const usableWidth = viewportSize.width - 2 * padding;
  const usableHeight = viewportSize.height - 2 * padding;
  const requestedZoom = Math.min(
    usableWidth / Math.max(1, bounds.width),
    usableHeight / Math.max(1, bounds.height),
  );
  const zoom = Math.min(
    boardFitZoomBounds.maximum,
    Math.max(boardFitZoomBounds.minimum, requestedZoom),
  );

  return {
    zoom,
    offset: {
      x: viewportSize.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: viewportSize.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    },
  };
}

export function viewportFitSceneBounds(
  scene: BoardSceneReadModel,
  selectedIds: readonly BoardObjectId[] | null,
): Rect2 | null {
  const ids =
    selectedIds ??
    scene.items
      .filter(({ object }) => object.visible)
      .map(({ object }) => object.id);
  return aggregateSelectionBounds(selectSelectionBounds(scene, ids));
}
