import { z } from "zod";

import type {
  BoardMediaAssetDescriptor,
  BoardMediaContentSource,
  BoardMediaRepository,
  BoardMediaUploadInput,
  MediaAssetObject,
} from "../../core/public";

const safeIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u)
  .refine((value) => !["__proto__", "constructor", "prototype"].includes(value));
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const uploadableMime = z.enum(["image/png", "image/jpeg", "image/gif"]);
const mediaMime = z.enum(["image/png", "image/jpeg", "image/gif", "video/mp4"]);
const intrinsicSize = z
  .object({
    height: z.number().int().positive().max(16_384),
    width: z.number().int().positive().max(16_384),
  })
  .strict();
const mediaDescriptorSchema = z
  .object({
    assetId: safeIdentifier,
    byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    contentSha256: sha256,
    createdAt: z.string().min(1).max(64),
    fileName: z.string().min(1).max(256),
    intrinsicSize,
    mimeType: uploadableMime,
    status: z.literal("available"),
  })
  .strict();
const mediaSourceSchema = z.object({
  assetId: safeIdentifier,
  byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  contentSha256: sha256,
  mimeType: mediaMime,
}).passthrough();
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{1,128}$/u;

export interface BoardMediaHttpAdapterDependencies {
  readonly baseUrl: string;
  readonly error: (
    code: string,
    message: string,
    status: number | null,
    retryable: boolean,
  ) => Error;
  readonly requireSuccess: (
    response: Response,
    fallback: string,
  ) => Promise<unknown>;
  readonly send: (path: string, init?: RequestInit) => Promise<Response>;
}

let nextMediaRepositoryScope = 0;

function abortedError(deps: BoardMediaHttpAdapterDependencies): Error {
  return deps.error(
    "board.media.aborted",
    "Загрузка изображения отменена.",
    null,
    false,
  );
}

function validateUpload(
  input: BoardMediaUploadInput,
  deps: BoardMediaHttpAdapterDependencies,
): void {
  if (
    input.body.size === 0 ||
    !sha256.safeParse(input.contentSha256).success ||
    !uploadableMime.safeParse(input.mimeType).success ||
    input.fileName.length < 1 ||
    input.fileName.length > 256 ||
    !idempotencyKeyPattern.test(input.idempotencyKey) ||
    input.csrfToken.length === 0
  ) {
    throw deps.error(
      "board.media.invalid-upload",
      "Параметры загружаемого изображения некорректны.",
      null,
      false,
    );
  }
}

export function createBoardMediaHttpMethods(
  dependencies: BoardMediaHttpAdapterDependencies,
): BoardMediaRepository {
  const { baseUrl, error, requireSuccess, send } = dependencies;
  // Cache identity never includes cookies or access epochs, and is isolated
  // between repository instances so old permission scopes cannot share pixels.
  const scope = ++nextMediaRepositoryScope;

  return {
    async uploadMedia(
      input: BoardMediaUploadInput,
    ): Promise<BoardMediaAssetDescriptor> {
      validateUpload(input, dependencies);
      if (input.signal?.aborted === true) throw abortedError(dependencies);
      const params = new URLSearchParams({ fileName: input.fileName });
      let response: Response;
      try {
        response = await send(
          `/boards/${encodeURIComponent(input.documentId)}/media?${params.toString()}`,
          {
            body: input.body,
            headers: {
              "Content-Type": input.mimeType,
              "X-Content-SHA256": input.contentSha256,
              "X-CSRF-Token": input.csrfToken,
              "X-Idempotency-Key": input.idempotencyKey,
            },
            method: "POST",
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          },
        );
      } catch (cause) {
        if (input.signal?.aborted === true) throw abortedError(dependencies);
        throw cause;
      }
      const payload = await requireSuccess(
        response,
        "Не удалось загрузить изображение на доску.",
      );
      const parsed = mediaDescriptorSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.contentSha256 !== input.contentSha256 ||
        parsed.data.byteSize !== input.body.size ||
        parsed.data.mimeType !== input.mimeType
      ) {
        throw error(
          "board.media.invalid-descriptor",
          "Сервер вернул несовместимое описание изображения.",
          response.status,
          false,
        );
      }
      return parsed.data;
    },

    resolveMediaContentSource(documentId, asset): BoardMediaContentSource {
      const validated = mediaSourceSchema.safeParse(asset);
      if (!validated.success || asset.kind !== "media.asset") {
        throw error(
          "board.media.invalid-reference",
          "Ссылка на изображение повреждена.",
          null,
          false,
        );
      }
      const { assetId, byteSize, contentSha256, mimeType } = validated.data;
      const path = `/boards/${encodeURIComponent(documentId)}/media/${encodeURIComponent(assetId)}/content`;
      const url = `${baseUrl}${path}`;
      const cacheKey = `media:${scope}:${documentId}:${assetId}:${contentSha256}`;
      return {
        cacheKey,
        contentSha256,
        mimeType,
        url,
        async loadBlob(signal?: AbortSignal): Promise<Blob> {
          if (signal?.aborted === true) throw abortedError(dependencies);
          let response: Response;
          try {
            response = await send(path, {
              headers: { Accept: mimeType },
              ...(signal === undefined ? {} : { signal }),
            });
          } catch (cause) {
            if (signal?.aborted === true) throw abortedError(dependencies);
            throw cause;
          }
          if (!response.ok) {
            // Media endpoints may return plain-text/HTML errors from the proxy.
            throw error(
              `board.http.${response.status}`,
              "Не удалось получить изображение доски.",
              response.status,
              response.status === 408 ||
                response.status === 429 ||
                response.status >= 500,
            );
          }
          const returnedMime = response.headers
            .get("content-type")
            ?.split(";")[0]
            ?.trim()
            .toLowerCase();
          if (
            returnedMime !== mimeType ||
            response.headers.get("x-content-sha256") !== contentSha256
          ) {
            throw error(
              "board.media.invalid-content",
              "Сервер вернул изображение с несовместимыми метаданными.",
              response.status,
              false,
            );
          }
          const blob = await response.blob();
          if (blob.size !== byteSize) {
            throw error(
              "board.media.invalid-content",
              "Размер полученного изображения не совпадает с ожидаемым.",
              response.status,
              false,
            );
          }
          return blob;
        },
      };
    },
  };
}
