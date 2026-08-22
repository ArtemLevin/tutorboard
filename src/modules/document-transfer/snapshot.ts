import {
  resolveVectorInkData,
  selectBoardScene,
  vectorInkCenterlinePathData,
  vectorInkOutlinePathData,
  type BoardDocument,
  type BoardObject,
  type BoardRenderItem,
  type Transform2D,
  type Vec2,
} from "../../core/public";
import { renderSafeMathLabel } from "../../shared/safe-math-label";

export interface BoardSnapshotOptions {
  readonly height?: number;
  readonly padding?: number;
  readonly pixelRatio?: number;
  readonly width?: number;
}

export interface BoardSnapshotBounds {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface BoardSnapshotLayout {
  readonly contentBounds: BoardSnapshotBounds | null;
  readonly height: number;
  readonly padding: number;
  readonly scale: number;
  readonly translation: Vec2;
  readonly width: number;
}

const emptySnapshot = { height: 720, width: 1280 } as const;
const defaultLongEdge = 1600;
const minimumShortEdge = 320;
const defaultPadding = 48;
const defaultPixelRatio = 3;
const maximumRasterEdge = 8192;
const maximumRasterPixels = 24_000_000;
const snapshotBackground = "#ffffff";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function number(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function transformAttribute(transform: Transform2D): string {
  return [
    `translate(${number(transform.translation.x)} ${number(transform.translation.y)})`,
    `rotate(${number(transform.rotation)})`,
    `scale(${number(transform.scale.x)} ${number(transform.scale.y)})`,
  ].join(" ");
}

function styleAttributes(object: BoardObject): string {
  return [
    `fill="${object.style.fill === null ? "none" : escapeXml(object.style.fill)}"`,
    `opacity="${number(object.style.opacity)}"`,
    `stroke="${object.style.stroke === null ? "none" : escapeXml(object.style.stroke)}"`,
    `stroke-width="${number(object.style.strokeWidth)}"`,
  ].join(" ");
}

function objectMarkup(object: BoardObject): string {
  const common = `${styleAttributes(object)} transform="translate(${number(object.position.x)} ${number(object.position.y)}) rotate(${number(object.rotation)}) scale(${number(object.scale.x)} ${number(object.scale.y)})"`;
  switch (object.kind) {
    case "drawing.pen-stroke": {
      const ink = resolveVectorInkData(object);
      const outline = vectorInkOutlinePathData(ink, object.style.strokeWidth);
      const centerline = vectorInkCenterlinePathData(ink);
      const transform = `transform="translate(${number(object.position.x)} ${number(object.position.y)}) rotate(${number(object.rotation)}) scale(${number(object.scale.x)} ${number(object.scale.y)})"`;
      const fill =
        ink.closed && object.style.fill !== null && centerline.length > 0
          ? `<path ${transform} d="${centerline}" fill="${escapeXml(object.style.fill)}" opacity="${number(object.style.opacity)}"/>`
          : "";
      const stroke =
        object.style.stroke !== null && outline.length > 0
          ? `<path ${transform} d="${outline}" fill="${escapeXml(object.style.stroke)}" opacity="${number(object.style.opacity)}"/>`
          : "";
      return `<g data-vector-ink-version="${ink.version}">${fill}${stroke}</g>`;
    }
    case "drawing.line":
      return `<line ${common}${object.lineStyle === "dashed" ? ' stroke-dasharray="10 6"' : ""} x1="0" y1="0" x2="${number(object.end.x)}" y2="${number(object.end.y)}"/>`;
    case "drawing.rectangle":
      return `<rect ${common} height="${number(object.size.height)}" rx="8" width="${number(object.size.width)}"/>`;
    case "math.coordinate-plot":
      return `<g ${common} aria-label="Coordinate plot with ${object.definition.series.length} series"><rect height="${number(object.definition.size.height)}" rx="8" width="${number(object.definition.size.width)}"/><line x1="0" y1="${number(object.definition.size.height / 2)}" x2="${number(object.definition.size.width)}" y2="${number(object.definition.size.height / 2)}"/><line x1="${number(object.definition.size.width / 2)}" y1="0" x2="${number(object.definition.size.width / 2)}" y2="${number(object.definition.size.height)}"/></g>`;
    case "drawing.ellipse":
      return `<ellipse ${common} cx="0" cy="0" rx="${number(object.radius.x)}" ry="${number(object.radius.y)}"/>`;
    case "drawing.text": {
      const label = renderSafeMathLabel(object.text);
      const lines = label.displayText.split(/\r?\n/u);
      return `<text aria-label="${escapeXml(label.accessibleText)}" font-family="Inter,ui-sans-serif,system-ui" font-size="22" ${common}>${lines.map((line, index) => `<tspan x="0" dy="${index === 0 ? "0" : "1.35em"}">${escapeXml(line)}</tspan>`).join("")}</text>`;
    }
    case "image.embedded":
      return `<image ${common} height="${number(object.size.height)}" href="${escapeXml(object.dataUrl)}" preserveAspectRatio="none" width="${number(object.size.width)}"/>`;
    case "svg-import.svg":
      return `<g ${common}>${object.sanitizedSvg}</g>`;
  }
}

function itemMarkup(item: BoardRenderItem): string {
  return item.transforms.reduceRight(
    (content, transform) =>
      `<g transform="${transformAttribute(transform)}">${content}</g>`,
    objectMarkup(item.object),
  );
}

function rotate(point: Vec2, degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function applyTransform(point: Vec2, transform: Transform2D): Vec2 {
  const rotated = rotate(
    { x: point.x * transform.scale.x, y: point.y * transform.scale.y },
    transform.rotation,
  );
  return {
    x: rotated.x + transform.translation.x,
    y: rotated.y + transform.translation.y,
  };
}

function rectangleCorners(bounds: BoardSnapshotBounds): readonly Vec2[] {
  return [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ];
}

function boundsFromPoints(points: readonly Vec2[]): BoardSnapshotBounds {
  const safePoints = points.length === 0 ? [{ x: 0, y: 0 }] : points;
  const xs = safePoints.map(({ x }) => x);
  const ys = safePoints.map(({ y }) => y);
  return {
    bottom: Math.max(...ys),
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
  };
}

function localObjectBounds(object: BoardObject): BoardSnapshotBounds {
  switch (object.kind) {
    case "drawing.pen-stroke":
      return boundsFromPoints(object.points);
    case "drawing.line":
      return boundsFromPoints([{ x: 0, y: 0 }, object.end]);
    case "drawing.rectangle":
    case "image.embedded":
    case "svg-import.svg":
      return {
        bottom: object.size.height,
        left: 0,
        right: object.size.width,
        top: 0,
      };
    case "math.coordinate-plot":
      return {
        bottom: object.definition.size.height,
        left: 0,
        right: object.definition.size.width,
        top: 0,
      };
    case "drawing.ellipse":
      return {
        bottom: object.radius.y,
        left: -object.radius.x,
        right: object.radius.x,
        top: -object.radius.y,
      };
    case "drawing.text": {
      const lines = renderSafeMathLabel(object.text).displayText.split(
        /\r?\n/u,
      );
      const longestLine = Math.max(1, ...lines.map((line) => line.length));
      return {
        bottom: Math.max(8, (lines.length - 1) * 30 + 8),
        left: 0,
        right: longestLine * 14,
        top: -24,
      };
    }
  }
}

function expandBounds(
  bounds: BoardSnapshotBounds,
  amount: number,
): BoardSnapshotBounds {
  return {
    bottom: bounds.bottom + amount,
    left: bounds.left - amount,
    right: bounds.right + amount,
    top: bounds.top - amount,
  };
}

function itemBounds(item: BoardRenderItem): BoardSnapshotBounds {
  const local = expandBounds(
    localObjectBounds(item.object),
    Math.max(2, item.object.style.strokeWidth / 2 + 1),
  );
  const objectTransform: Transform2D = {
    rotation: item.object.rotation,
    scale: item.object.scale,
    translation: item.object.position,
  };
  const points = rectangleCorners(local).map((point) => {
    let transformed = applyTransform(point, objectTransform);
    for (let index = item.transforms.length - 1; index >= 0; index -= 1) {
      transformed = applyTransform(transformed, item.transforms[index]!);
    }
    return transformed;
  });
  return boundsFromPoints(points);
}

function unionBounds(
  items: readonly BoardRenderItem[],
): BoardSnapshotBounds | null {
  if (items.length === 0) {
    return null;
  }
  const first = itemBounds(items[0]!);
  return items.slice(1).reduce<BoardSnapshotBounds>((combined, item) => {
    const current = itemBounds(item);
    return {
      bottom: Math.max(combined.bottom, current.bottom),
      left: Math.min(combined.left, current.left),
      right: Math.max(combined.right, current.right),
      top: Math.min(combined.top, current.top),
    };
  }, first);
}

function validatePositiveDimension(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be positive.`);
  }
}

function resolveOutputDimensions(
  bounds: BoardSnapshotBounds | null,
  options: BoardSnapshotOptions,
): { readonly height: number; readonly width: number } {
  const requestedWidth = options.width;
  const requestedHeight = options.height;
  if (requestedWidth !== undefined) {
    validatePositiveDimension(requestedWidth, "Snapshot width");
  }
  if (requestedHeight !== undefined) {
    validatePositiveDimension(requestedHeight, "Snapshot height");
  }
  if (requestedWidth !== undefined && requestedHeight !== undefined) {
    return { height: requestedHeight, width: requestedWidth };
  }
  if (bounds === null) {
    return {
      height: requestedHeight ?? emptySnapshot.height,
      width: requestedWidth ?? emptySnapshot.width,
    };
  }

  const contentWidth = Math.max(1, bounds.right - bounds.left);
  const contentHeight = Math.max(1, bounds.bottom - bounds.top);
  const aspectRatio = contentWidth / contentHeight;
  if (requestedWidth !== undefined) {
    return {
      height: Math.max(1, Math.round(requestedWidth / aspectRatio)),
      width: requestedWidth,
    };
  }
  if (requestedHeight !== undefined) {
    return {
      height: requestedHeight,
      width: Math.max(1, Math.round(requestedHeight * aspectRatio)),
    };
  }
  return contentWidth >= contentHeight
    ? {
        height: Math.max(
          minimumShortEdge,
          Math.round(defaultLongEdge / aspectRatio),
        ),
        width: defaultLongEdge,
      }
    : {
        height: defaultLongEdge,
        width: Math.max(
          minimumShortEdge,
          Math.round(defaultLongEdge * aspectRatio),
        ),
      };
}

export function resolveBoardSnapshotLayout(
  document: BoardDocument,
  options: BoardSnapshotOptions = {},
): BoardSnapshotLayout {
  const scene = selectBoardScene(document);
  const visibleItems = scene.items.filter(({ object }) => object.visible);
  const contentBounds = unionBounds(visibleItems);
  const { height, width } = resolveOutputDimensions(contentBounds, options);
  const requestedPadding = options.padding ?? defaultPadding;
  if (!Number.isFinite(requestedPadding) || requestedPadding < 0) {
    throw new RangeError("Snapshot padding must be non-negative.");
  }
  const padding = Math.min(requestedPadding, width * 0.2, height * 0.2);
  if (contentBounds === null) {
    return {
      contentBounds,
      height,
      padding,
      scale: 1,
      translation: { x: 0, y: 0 },
      width,
    };
  }

  const contentWidth = Math.max(1, contentBounds.right - contentBounds.left);
  const contentHeight = Math.max(1, contentBounds.bottom - contentBounds.top);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(
    availableWidth / contentWidth,
    availableHeight / contentHeight,
  );
  return {
    contentBounds,
    height,
    padding,
    scale,
    translation: {
      x: (width - contentWidth * scale) / 2 - contentBounds.left * scale,
      y: (height - contentHeight * scale) / 2 - contentBounds.top * scale,
    },
    width,
  };
}

function renderBoardSnapshotSvgWithLayout(
  document: BoardDocument,
  layout: BoardSnapshotLayout,
): string {
  const scene = selectBoardScene(document);
  const visibleItems = scene.items.filter(({ object }) => object.visible);
  const content =
    visibleItems.length === 0
      ? ""
      : `<g transform="translate(${number(layout.translation.x)} ${number(layout.translation.y)}) scale(${number(layout.scale)})">${visibleItems.map((item) => itemMarkup(item)).join("")}</g>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(document.title)}" width="${number(layout.width)}" height="${number(layout.height)}" viewBox="0 0 ${number(layout.width)} ${number(layout.height)}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">`,
    `<rect width="100%" height="100%" fill="${snapshotBackground}"/>`,
    content,
    "</svg>",
  ].join("");
}

export function renderBoardSnapshotSvg(
  document: BoardDocument,
  options: BoardSnapshotOptions = {},
): string {
  return renderBoardSnapshotSvgWithLayout(
    document,
    resolveBoardSnapshotLayout(document, options),
  );
}

function resolveRasterSize(
  layout: BoardSnapshotLayout,
  pixelRatio: number,
): { readonly height: number; readonly width: number } {
  validatePositiveDimension(pixelRatio, "Snapshot pixel ratio");
  const desiredWidth = layout.width * pixelRatio;
  const desiredHeight = layout.height * pixelRatio;
  const edgeScale = Math.min(
    1,
    maximumRasterEdge / Math.max(desiredWidth, desiredHeight),
  );
  const areaScale = Math.min(
    1,
    Math.sqrt(maximumRasterPixels / (desiredWidth * desiredHeight)),
  );
  const scale = Math.min(edgeScale, areaScale);
  return {
    height: Math.max(1, Math.round(desiredHeight * scale)),
    width: Math.max(1, Math.round(desiredWidth * scale)),
  };
}

async function rasterizeBoardSnapshot(
  document: BoardDocument,
  options: BoardSnapshotOptions,
): Promise<Blob> {
  const layout = resolveBoardSnapshotLayout(document, options);
  const svg = renderBoardSnapshotSvgWithLayout(document, layout);
  const source = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The SVG snapshot could not be rasterized."));
      image.src = url;
    });
    const raster = resolveRasterSize(
      layout,
      options.pixelRatio ?? defaultPixelRatio,
    );
    const canvas = window.document.createElement("canvas");
    canvas.height = raster.height;
    canvas.width = raster.width;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("A 2D canvas context is unavailable.");
    }
    context.fillStyle = snapshotBackground;
    context.fillRect(0, 0, raster.width, raster.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, raster.width, raster.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob === null) {
          reject(new Error("The PNG snapshot could not be encoded."));
        } else {
          resolve(blob);
        }
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderBoardSnapshotPng(
  document: BoardDocument,
  options: BoardSnapshotOptions = {},
): Promise<Blob> {
  return rasterizeBoardSnapshot(document, options);
}

export async function renderBoardSnapshotPdf(
  document: BoardDocument,
  options: BoardSnapshotOptions = {},
): Promise<Blob> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const layout = resolveBoardSnapshotLayout(document, options);
  const png = await rasterizeBoardSnapshot(document, options);
  const pdf = await PDFDocument.create();
  pdf.setTitle(document.title);
  pdf.setCreator("TutorBoard");
  pdf.setProducer("TutorBoard PDF export");

  const portrait = { height: 841.89, width: 595.28 } as const;
  const landscape = { height: portrait.width, width: portrait.height } as const;
  const pageSize = layout.width >= layout.height ? landscape : portrait;
  const margin = 18;
  const page = pdf.addPage([pageSize.width, pageSize.height]);
  page.drawRectangle({
    color: rgb(1, 1, 1),
    height: pageSize.height,
    width: pageSize.width,
    x: 0,
    y: 0,
  });
  const image = await pdf.embedPng(await png.arrayBuffer());
  const scale = Math.min(
    (pageSize.width - margin * 2) / image.width,
    (pageSize.height - margin * 2) / image.height,
  );
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  page.drawImage(image, {
    height: renderedHeight,
    width: renderedWidth,
    x: (pageSize.width - renderedWidth) / 2,
    y: (pageSize.height - renderedHeight) / 2,
  });
  const bytes = await pdf.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "application/pdf" });
}
