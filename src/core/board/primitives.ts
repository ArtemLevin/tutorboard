export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Size2 {
  readonly height: number;
  readonly width: number;
}

export interface Transform2D {
  readonly rotation: number;
  readonly scale: Vec2;
  readonly translation: Vec2;
}

export interface ViewportState {
  readonly offset: Vec2;
  readonly zoom: number;
}

export const identityTransform: Transform2D = {
  rotation: 0,
  scale: { x: 1, y: 1 },
  translation: { x: 0, y: 0 },
};

export const defaultViewport: ViewportState = {
  offset: { x: 0, y: 0 },
  zoom: 1,
};
