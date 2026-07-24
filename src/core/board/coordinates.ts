import type { Vec2, ViewportState } from "./primitives";

export interface ZoomBounds {
  readonly maximum: number;
  readonly minimum: number;
}

function assertFinitePoint(point: Vec2, name: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${name} must contain finite coordinates.`);
  }
}

function assertViewport(viewport: ViewportState): void {
  assertFinitePoint(viewport.offset, "Viewport offset");
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) {
    throw new RangeError("Viewport zoom must be finite and positive.");
  }
}

export function screenToWorld(
  screenPoint: Vec2,
  viewport: ViewportState,
): Vec2 {
  assertFinitePoint(screenPoint, "Screen point");
  assertViewport(viewport);

  return {
    x: (screenPoint.x - viewport.offset.x) / viewport.zoom,
    y: (screenPoint.y - viewport.offset.y) / viewport.zoom,
  };
}

export function worldToScreen(worldPoint: Vec2, viewport: ViewportState): Vec2 {
  assertFinitePoint(worldPoint, "World point");
  assertViewport(viewport);

  return {
    x: worldPoint.x * viewport.zoom + viewport.offset.x,
    y: worldPoint.y * viewport.zoom + viewport.offset.y,
  };
}

export function panViewport(
  viewport: ViewportState,
  screenDelta: Vec2,
): ViewportState {
  assertViewport(viewport);
  assertFinitePoint(screenDelta, "Pan delta");

  return {
    ...viewport,
    offset: {
      x: viewport.offset.x + screenDelta.x,
      y: viewport.offset.y + screenDelta.y,
    },
  };
}

export function zoomViewportAt(
  viewport: ViewportState,
  screenPoint: Vec2,
  requestedZoom: number,
  bounds: ZoomBounds,
): ViewportState {
  assertViewport(viewport);
  assertFinitePoint(screenPoint, "Zoom anchor");
  if (
    !Number.isFinite(requestedZoom) ||
    !Number.isFinite(bounds.minimum) ||
    !Number.isFinite(bounds.maximum) ||
    bounds.minimum <= 0 ||
    bounds.minimum > bounds.maximum
  ) {
    throw new RangeError("Zoom request and bounds must be finite and valid.");
  }

  const worldPoint = screenToWorld(screenPoint, viewport);
  const zoom = Math.min(
    bounds.maximum,
    Math.max(bounds.minimum, requestedZoom),
  );

  return {
    zoom,
    offset: {
      x: screenPoint.x - worldPoint.x * zoom,
      y: screenPoint.y - worldPoint.y * zoom,
    },
  };
}
