import type { MathInkRecognitionRequest } from "../../modules/handwritten-function/public";

const maximumCanvasSide = 768;
const minimumContentSide = 96;
const canvasPadding = 24;
const strokeWidth = 5;

export interface MathInkRasterLayout {
  readonly contentHeight: number;
  readonly contentWidth: number;
  readonly height: number;
  readonly padding: number;
  readonly scale: number;
  readonly width: number;
}

export interface RasterizedMathInkImage {
  readonly data: string;
  readonly height: number;
  readonly mimeType: "image/png";
  readonly width: number;
}

export type MathInkRasterizer = (
  request: MathInkRecognitionRequest,
) => Promise<RasterizedMathInkImage>;

function boundedDimension(value: number): number {
  return Math.max(1e-6, Math.min(1, value));
}

export function calculateMathInkRasterLayout(
  normalizedWidth: number,
  normalizedHeight: number,
): MathInkRasterLayout {
  const sourceWidth = boundedDimension(normalizedWidth);
  const sourceHeight = boundedDimension(normalizedHeight);
  const longest = Math.max(sourceWidth, sourceHeight);
  const available = maximumCanvasSide - canvasPadding * 2;
  const scale = Math.max(minimumContentSide / longest, available / longest);
  const contentWidth = Math.max(
    minimumContentSide,
    Math.round(sourceWidth * scale),
  );
  const contentHeight = Math.max(
    minimumContentSide,
    Math.round(sourceHeight * scale),
  );
  const constrainedScale = Math.min(
    scale,
    available / Math.max(sourceWidth, sourceHeight),
  );
  const finalContentWidth = Math.min(
    available,
    Math.max(minimumContentSide, Math.round(sourceWidth * constrainedScale)),
  );
  const finalContentHeight = Math.min(
    available,
    Math.max(minimumContentSide, Math.round(sourceHeight * constrainedScale)),
  );
  return {
    contentHeight: finalContentHeight,
    contentWidth: finalContentWidth,
    height: finalContentHeight + canvasPadding * 2,
    padding: canvasPadding,
    scale: constrainedScale,
    width: finalContentWidth + canvasPadding * 2,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

function drawRequest(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  request: MathInkRecognitionRequest,
  layout: MathInkRasterLayout,
): void {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, layout.width, layout.height);
  context.strokeStyle = "#000000";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = strokeWidth;

  for (const stroke of request.strokes) {
    if (stroke.points.length < 2) continue;
    context.beginPath();
    const first = stroke.points[0];
    context.moveTo(
      layout.padding + first.x * layout.scale,
      layout.padding + first.y * layout.scale,
    );
    for (const point of stroke.points.slice(1)) {
      context.lineTo(
        layout.padding + point.x * layout.scale,
        layout.padding + point.y * layout.scale,
      );
    }
    context.stroke();
  }
}

async function rasterizeWithOffscreenCanvas(
  request: MathInkRecognitionRequest,
  layout: MathInkRasterLayout,
): Promise<RasterizedMathInkImage> {
  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D canvas is unavailable for formula recognition.");
  }
  drawRequest(context, request, layout);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return {
    data: await blobToBase64(blob),
    height: layout.height,
    mimeType: "image/png",
    width: layout.width,
  };
}

async function rasterizeWithHtmlCanvas(
  request: MathInkRecognitionRequest,
  layout: MathInkRasterLayout,
): Promise<RasterizedMathInkImage> {
  if (typeof document === "undefined") {
    throw new Error("Canvas is unavailable for formula recognition.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("2D canvas is unavailable for formula recognition.");
  }
  drawRequest(context, request, layout);
  const dataUrl = canvas.toDataURL("image/png");
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("Canvas returned an unsupported image format.");
  }
  return {
    data: dataUrl.slice(prefix.length),
    height: layout.height,
    mimeType: "image/png",
    width: layout.width,
  };
}

export const rasterizeMathInkRequest: MathInkRasterizer = async (request) => {
  const layout = calculateMathInkRasterLayout(
    request.normalizedWidth,
    request.normalizedHeight,
  );
  return typeof OffscreenCanvas === "function"
    ? rasterizeWithOffscreenCanvas(request, layout)
    : rasterizeWithHtmlCanvas(request, layout);
};
