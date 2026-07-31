import Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Group, Image as KonvaImage, Rect } from "react-konva";

import type { EmbeddedImageObject } from "../../core/public";

export function EmbeddedImageRenderer({
  object,
}: {
  readonly object: EmbeddedImageObject;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<Konva.Image>(null);

  useEffect(() => {
    const element = new Image();
    let active = true;
    element.decoding = "async";
    element.onload = () => {
      if (active) {
        setFailed(false);
        setImage(element);
      }
    };
    element.onerror = () => {
      if (active) {
        setFailed(true);
        setImage(null);
      }
    };
    element.src = object.dataUrl;
    return () => {
      active = false;
      element.src = "";
    };
  }, [object.dataUrl]);

  useEffect(() => {
    if (object.mimeType !== "image/gif" || image === null) {
      return;
    }
    let frame = 0;
    const draw = () => {
      imageRef.current?.getLayer()?.batchDraw();
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [image, object.mimeType]);

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
