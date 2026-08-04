import {
  resolveVectorInkData,
  selectBoardScene,
  vectorInkCenterlinePathData,
  vectorInkOutlinePathData,
  type BoardDocument,
  type BoardObject,
  type BoardRenderItem,
  type Transform2D,
} from "../../core/public";
import { renderSafeMathLabel } from "../../shared/safe-math-label";

export interface BoardSnapshotOptions {
  readonly height?: number;
  readonly width?: number;
}

const defaultSnapshot = { height: 720, width: 1280 } as const;

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

function objectMarkup(object: BoardObject, zoom: number): string {
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

function itemMarkup(item: BoardRenderItem, zoom: number): string {
  return item.transforms.reduceRight(
    (content, transform) =>
      `<g transform="${transformAttribute(transform)}">${content}</g>`,
    objectMarkup(item.object, zoom),
  );
}

export function renderBoardSnapshotSvg(
  document: BoardDocument,
  options: BoardSnapshotOptions = {},
): string {
  const height = options.height ?? defaultSnapshot.height;
  const width = options.width ?? defaultSnapshot.width;
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(width) ||
    height <= 0 ||
    width <= 0
  ) {
    throw new RangeError("Snapshot dimensions must be positive.");
  }
  const scene = selectBoardScene(document);
  const visibleItems = scene.items.filter(({ object }) => object.visible);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(document.title)}" viewBox="0 0 ${number(width)} ${number(height)}">`,
    '<rect width="100%" height="100%" fill="#f8fafc"/>',
    `<g transform="translate(${number(scene.viewport.offset.x)} ${number(scene.viewport.offset.y)}) scale(${number(scene.viewport.zoom)})">`,
    visibleItems.map((item) => itemMarkup(item, scene.viewport.zoom)).join(""),
    "</g>",
    "</svg>",
  ].join("");
}

export async function renderBoardSnapshotPng(
  document: BoardDocument,
  options: BoardSnapshotOptions = {},
): Promise<Blob> {
  const height = options.height ?? defaultSnapshot.height;
  const width = options.width ?? defaultSnapshot.width;
  const svg = renderBoardSnapshotSvg(document, { height, width });
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
    const canvas = window.document.createElement("canvas");
    canvas.height = height;
    canvas.width = width;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("A 2D canvas context is unavailable.");
    }
    context.drawImage(image, 0, 0, width, height);
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

export async function renderBoardSnapshotPdf(
  document: BoardDocument,
  options: BoardSnapshotOptions = {},
): Promise<Blob> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const width = options.width ?? defaultSnapshot.width;
  const height = options.height ?? defaultSnapshot.height;
  const png = await renderBoardSnapshotPng(document, { height, width });
  const pdf = await PDFDocument.create();
  pdf.setTitle(document.title);
  pdf.setCreator("TutorBoard");
  pdf.setProducer("TutorBoard PDF export");
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 24;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawRectangle({
    color: rgb(248 / 255, 250 / 255, 252 / 255),
    height: pageHeight,
    width: pageWidth,
    x: 0,
    y: 0,
  });
  const image = await pdf.embedPng(await png.arrayBuffer());
  const scale = Math.min(
    (pageWidth - margin * 2) / image.width,
    (pageHeight - margin * 2) / image.height,
  );
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  page.drawImage(image, {
    height: renderedHeight,
    width: renderedWidth,
    x: (pageWidth - renderedWidth) / 2,
    y: (pageHeight - renderedHeight) / 2,
  });
  const bytes = await pdf.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "application/pdf" });
}
