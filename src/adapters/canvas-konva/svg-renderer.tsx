import { useEffect, useState } from "react";
import { Image as KonvaImage, Rect } from "react-konva";

import type { SvgObject } from "../../core/public";

interface SvgRendererProps {
  readonly object: SvgObject;
}

interface SvgLoadState {
  readonly failed: boolean;
  readonly image: HTMLImageElement | null;
  readonly source: string;
}

export function SvgRenderer({ object }: SvgRendererProps) {
  const [loadState, setLoadState] = useState<SvgLoadState>({
    failed: false,
    image: null,
    source: "",
  });

  useEffect(() => {
    const source = object.sanitizedSvg;
    const blob = new Blob([source], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const nextImage = new Image();
    let active = true;

    nextImage.onload = () => {
      if (active) {
        setLoadState({ failed: false, image: nextImage, source });
      }
    };
    nextImage.onerror = () => {
      if (active) {
        setLoadState({ failed: true, image: null, source });
      }
    };
    nextImage.src = url;

    return () => {
      active = false;
      nextImage.onload = null;
      nextImage.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [object.sanitizedSvg]);

  const isCurrentSource = loadState.source === object.sanitizedSvg;
  const image = isCurrentSource ? loadState.image : null;
  const failed = isCurrentSource && loadState.failed;
  const common = {
    height: object.size.height,
    opacity: object.style.opacity,
    rotation: object.rotation,
    scaleX: object.scale.x,
    scaleY: object.scale.y,
    visible: object.visible,
    width: object.size.width,
    x: object.position.x,
    y: object.position.y,
  } as const;

  if (failed || image === null) {
    return (
      <Rect
        {...common}
        {...(failed ? { dash: [8, 6] } : {})}
        fill={failed ? "#f8e8e5" : "#eef2f4"}
        stroke={failed ? "#b94a3d" : "#9aa8b1"}
        strokeWidth={1}
      />
    );
  }

  return <KonvaImage {...common} image={image} />;
}
