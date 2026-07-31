import Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage } from "react-konva";

import type { ImageObject } from "../../core/public";

export function ImageRenderer({ object }: { readonly object: ImageObject }) {
  const nodeRef = useRef<Konva.Image>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const element = new Image();
    element.decoding = "async";
    element.src = object.dataUrl;
    const handleLoad = () => setImage(element);
    element.addEventListener("load", handleLoad);
    return () => element.removeEventListener("load", handleLoad);
  }, [object.dataUrl]);

  useEffect(() => {
    if (object.mimeType !== "image/gif" || image === null) return;
    const layer = nodeRef.current?.getLayer();
    if (layer === undefined || layer === null) return;
    const animation = new Konva.Animation(() => undefined, layer);
    animation.start();
    return () => animation.stop();
  }, [image, object.mimeType]);

  return (
    <KonvaImage
      height={object.size.height}
      hitStrokeWidth={14}
      image={image ?? undefined}
      name="board-transform-target"
      opacity={object.style.opacity}
      ref={nodeRef}
      rotation={object.rotation}
      scaleX={object.scale.x}
      scaleY={object.scale.y}
      visible={object.visible}
      width={object.size.width}
      x={object.position.x}
      y={object.position.y}
    />
  );
}
