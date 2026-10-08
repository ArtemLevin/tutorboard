import Konva from "konva";
import { useContext, useEffect, useRef, useState } from "react";
import { Group, Image as KonvaImage, Rect } from "react-konva";

import type {
  BoardMediaContentSource,
  EmbeddedImageObject,
  MediaAssetObject,
} from "../../core/public";
import { startAnimatedImageRedraw } from "./animated-image-redraw";
import { AnimatedImageRedrawContext } from "./animated-image-redraw-context";
import { mediaObjectUrlCache } from "./media-object-url-cache";
import {
  rasterDecodeCache,
  resolveRasterDecodeSize,
} from "./raster-decode-cache";
import { rasterImageDiagnostics } from "./raster-image-diagnostics";

export function RasterImageRenderer({
  object,
  source,
  visualScale = 1,
  zoom,
}: {
  readonly object: EmbeddedImageObject | MediaAssetObject;
  readonly source?: BoardMediaContentSource;
  readonly visualScale?: number;
  readonly zoom: number;
}) {
  const [imageState, setImageState] = useState<{
    readonly image: CanvasImageSource;
    readonly key: string;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<Konva.Image>(null);
  const redrawCoordinator = useContext(AnimatedImageRedrawContext);
  const staticRaster =
    object.mimeType === "image/png" || object.mimeType === "image/jpeg";
  const dataUrl = object.kind === "image.embedded" ? object.dataUrl : null;
  const decodeSize = staticRaster
    ? resolveRasterDecodeSize({
        ancestorScale: visualScale,
        devicePixelRatio:
          typeof window === "undefined" ? 1 : window.devicePixelRatio,
        displaySize: object.size,
        intrinsicSize: object.intrinsicSize,
        objectScale: object.scale,
        zoom,
      })
    : null;
  const decodeHeight = decodeSize?.height ?? null;
  const decodeWidth = decodeSize?.width ?? null;
  const cachedBitmapPath =
    staticRaster &&
    decodeHeight !== null &&
    decodeWidth !== null &&
    (source !== undefined || typeof createImageBitmap === "function");
  const sourceIdentity = source?.cacheKey ?? object.contentSha256;
  const sourceKey = cachedBitmapPath
    ? `${sourceIdentity}:${decodeWidth}x${decodeHeight}`
    : `${sourceIdentity}:html`;
  const image = imageState?.key === sourceKey ? imageState.image : null;

  useEffect(() => {
    if (cachedBitmapPath && decodeHeight !== null && decodeWidth !== null) {
      if (source === undefined && dataUrl === null) return;
      const size = { height: decodeHeight, width: decodeWidth };
      const request = source === undefined
        ? { contentSha256: object.contentSha256, dataUrl: dataUrl ?? "", size }
        : { contentSha256: object.contentSha256, source, size };
      const handle = rasterDecodeCache.acquire(request);
      let active = true;
      void handle.promise
        .then(({ image: bitmap }) => {
          if (!active) return;
          setFailed(false);
          setImageState({ image: bitmap, key: sourceKey });
        })
        .catch(() => {
          if (!active) return;
          setFailed(true);
          setImageState(null);
        });
      return () => {
        active = false;
        handle.release();
      };
    }

    const element = new Image();
    const sessionId = rasterImageDiagnostics.begin(
      object.contentSha256,
      performance.now(),
    );
    let active = true;
    element.decoding = "async";
    element.onload = () => {
      if (!active) return;
      rasterImageDiagnostics.complete(
        sessionId,
        element.naturalWidth,
        element.naturalHeight,
        performance.now(),
      );
      setFailed(false);
      setImageState({ image: element, key: sourceKey });
    };
    element.onerror = () => {
      if (!active) return;
      rasterImageDiagnostics.fail(sessionId);
      setFailed(true);
      setImageState(null);
    };
    const handle = source === undefined
      ? null
      : mediaObjectUrlCache.acquire(source);
    if (handle !== null) {
      void handle.promise.then((url) => {
        if (active) element.src = url;
      }).catch(() => {
        if (!active) return;
        rasterImageDiagnostics.fail(sessionId);
        setFailed(true);
        setImageState(null);
      });
    } else if (dataUrl !== null) {
      element.src = dataUrl;
    }
    return () => {
      active = false;
      rasterImageDiagnostics.release(sessionId);
      element.onload = null;
      element.onerror = null;
      element.src = "";
      handle?.release();
    };
  }, [
    cachedBitmapPath,
    decodeHeight,
    decodeWidth,
    object.contentSha256,
    dataUrl,
    object.mimeType,
    source?.cacheKey,
    sourceKey,
  ]);

  useEffect(() => {
    if (object.mimeType !== "image/gif" || image === null) {
      return;
    }
    if (redrawCoordinator !== null) {
      return redrawCoordinator.register(
        () => imageRef.current?.getLayer() ?? null,
      );
    }
    return startAnimatedImageRedraw(() => {
      imageRef.current?.getLayer()?.batchDraw();
    });
  }, [image, object.mimeType, redrawCoordinator]);

  return (
    <Group
      name="board-transform-target"
      opacity={object.style.opacity}
      rotation={object.rotation}
      scaleX={object.scale.x}
      scaleY={object.scale.y}
      visible={object.visible}
      x={object.position.x}
      y={object.position.y}
    >
      <Rect
        fill="rgba(15, 23, 42, 0.001)"
        height={object.size.height}
        width={object.size.width}
      />
      {image === null ? (
        <Rect
          dash={[8, 6]}
          fill={
            failed ? "rgba(239, 68, 68, 0.08)" : "rgba(148, 163, 184, 0.08)"
          }
          height={object.size.height}
          listening={false}
          stroke={failed ? "#dc2626" : "#94a3b8"}
          strokeWidth={1}
          width={object.size.width}
        />
      ) : (
        <KonvaImage
          height={object.size.height}
          image={image}
          listening={false}
          perfectDrawEnabled={false}
          ref={imageRef}
          width={object.size.width}
        />
      )}
    </Group>
  );
}

export function EmbeddedImageRenderer({
  object,
  visualScale,
  zoom,
}: {
  readonly object: EmbeddedImageObject;
  readonly visualScale?: number;
  readonly zoom: number;
}) {
  return <RasterImageRenderer object={object} visualScale={visualScale} zoom={zoom} />;
}
