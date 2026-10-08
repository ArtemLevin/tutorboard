import type {
  BoardMediaContentSource,
  MediaAssetObject,
} from "../../core/public";
import { RasterImageRenderer } from "./embedded-image-renderer";
import { MediaAssetPlaceholderRenderer } from "./media-asset-placeholder-renderer";

export function MediaAssetRenderer({
  object,
  source,
  visualScale = 1,
  zoom,
}: {
  readonly object: MediaAssetObject;
  readonly source: BoardMediaContentSource;
  readonly visualScale?: number;
  readonly zoom: number;
}) {
  if (object.mimeType === "video/mp4") {
    return <MediaAssetPlaceholderRenderer object={object} />;
  }
  return (
    <RasterImageRenderer
      object={object}
      source={source}
      visualScale={visualScale}
      zoom={zoom}
    />
  );
}
