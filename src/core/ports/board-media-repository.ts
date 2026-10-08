import type { DocumentId } from "../board/identifiers";
import type { MediaAssetMimeType, MediaAssetObject } from "../board/objects";

export type UploadableBoardMediaMimeType = Exclude<
  MediaAssetMimeType,
  "video/mp4"
>;

export interface BoardMediaAssetDescriptor {
  readonly assetId: string;
  readonly byteSize: number;
  readonly contentSha256: string;
  readonly createdAt: string;
  readonly fileName: string;
  readonly intrinsicSize: {
    readonly height: number;
    readonly width: number;
  };
  readonly mimeType: UploadableBoardMediaMimeType;
  readonly status: "available";
}

export interface BoardMediaUploadInput {
  readonly body: Blob;
  readonly contentSha256: string;
  readonly csrfToken: string;
  readonly documentId: DocumentId;
  readonly fileName: string;
  readonly idempotencyKey: string;
  readonly mimeType: UploadableBoardMediaMimeType;
  readonly signal?: AbortSignal;
}

export interface BoardMediaContentSource {
  /** Unique to this repository/session, board, asset, checksum and exact URL. */
  readonly cacheKey: string;
  readonly contentSha256: string;
  readonly mimeType: MediaAssetMimeType;
  /** Authenticated same-origin URL for animated GIF/HTML image rendering. */
  readonly url: string;
  /** Deferred bounded fetch for PNG/JPEG decoding; caller owns the Blob. */
  loadBlob(signal?: AbortSignal): Promise<Blob>;
}

export interface BoardMediaRepository {
  readonly uploadMedia: (
    input: BoardMediaUploadInput,
  ) => Promise<BoardMediaAssetDescriptor>;
  readonly resolveMediaContentSource: (
    documentId: DocumentId,
    asset: MediaAssetObject,
  ) => BoardMediaContentSource;
}
