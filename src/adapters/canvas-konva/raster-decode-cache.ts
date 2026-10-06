import type { Size2 } from "../../core/public";

import {
  rasterImageDiagnostics,
  type RasterImageDiagnostics,
} from "./raster-image-diagnostics";

export const defaultRasterDecodeBudgetBytes = 128 * 1024 * 1024;
export const defaultRasterDecodeConcurrency = 2;
const minimumRasterBucketPixels = 64;

export interface RasterDecodeSizeInput {
  readonly ancestorScale?: number | undefined;
  readonly devicePixelRatio: number;
  readonly displaySize: Size2;
  readonly intrinsicSize: Size2;
  readonly objectScale: {
    readonly x: number;
    readonly y: number;
  };
  readonly zoom: number;
}

export interface RasterDecodeRequest {
  readonly contentSha256: string;
  readonly dataUrl: string;
  readonly size: Size2;
}

export interface RasterBitmapResource {
  readonly height: number;
  readonly image: CanvasImageSource;
  readonly width: number;
  close(): void;
}

export interface RasterDecodedImage {
  readonly height: number;
  readonly image: CanvasImageSource;
  readonly width: number;
}

export interface RasterDecodeHandle {
  readonly promise: Promise<RasterDecodedImage>;
  release(): void;
}

export type RasterBitmapDecoder = (
  request: RasterDecodeRequest,
) => Promise<RasterBitmapResource>;

interface RasterDecodeCacheOptions {
  readonly budgetBytes?: number;
  readonly decoder?: RasterBitmapDecoder;
  readonly diagnostics?: RasterImageDiagnostics;
  readonly maxConcurrent?: number;
  readonly now?: () => number;
}

interface CacheEntry {
  readonly contentSha256: string;
  readonly dataUrl: string;
  readonly key: string;
  readonly promise: Promise<RasterDecodedImage>;
  readonly reject: (error: Error) => void;
  readonly resolve: (value: RasterDecodedImage) => void;
  readonly size: Size2;
  bytes: number;
  resource: RasterBitmapResource | null;
  lastUsed: number;
  refs: number;
  sessionId: number | null;
  state: "queued" | "decoding" | "ready";
}

function nextPowerOfTwo(value: number): number {
  let bucket = 1;
  while (bucket < value) bucket *= 2;
  return bucket;
}

export function resolveRasterDecodeSize({
  ancestorScale = 1,
  devicePixelRatio,
  displaySize,
  intrinsicSize,
  objectScale,
  zoom,
}: RasterDecodeSizeInput): Size2 {
  const intrinsicMax = Math.max(intrinsicSize.width, intrinsicSize.height);
  if (intrinsicMax <= 0) return { height: 1, width: 1 };

  const effectiveWidth =
    displaySize.width *
    Math.max(0, Math.abs(objectScale.x)) *
    Math.max(0, ancestorScale) *
    Math.max(0, zoom) *
    Math.max(1, devicePixelRatio);
  const effectiveHeight =
    displaySize.height *
    Math.max(0, Math.abs(objectScale.y)) *
    Math.max(0, ancestorScale) *
    Math.max(0, zoom) *
    Math.max(1, devicePixelRatio);
  const desiredMax = Math.max(
    minimumRasterBucketPixels,
    effectiveWidth,
    effectiveHeight,
  );
  const bucket = Math.min(intrinsicMax, nextPowerOfTwo(desiredMax));
  const ratio = Math.min(1, bucket / intrinsicMax);

  return {
    height: Math.max(1, Math.round(intrinsicSize.height * ratio)),
    width: Math.max(1, Math.round(intrinsicSize.width * ratio)),
  };
}

function decodeHtmlImage(dataUrl: string): Promise<RasterBitmapResource> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onerror = () =>
      reject(new Error("Raster image fallback decode failed."));
    image.onload = () =>
      resolve({
        close: () => {
          image.src = "";
        },
        height: image.naturalHeight,
        image,
        width: image.naturalWidth,
      });
    image.src = dataUrl;
  });
}

async function decodeRasterBitmap(
  request: RasterDecodeRequest,
): Promise<RasterBitmapResource> {
  try {
    const response = await fetch(request.dataUrl);
    if (!response.ok) {
      throw new Error(`Raster source fetch failed: ${response.status}`);
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, {
      resizeHeight: request.size.height,
      resizeQuality: "high",
      resizeWidth: request.size.width,
    });
    return {
      close: () => bitmap.close(),
      height: bitmap.height,
      image: bitmap,
      width: bitmap.width,
    };
  } catch {
    return await decodeHtmlImage(request.dataUrl);
  }
}

function cacheKey(request: RasterDecodeRequest): string {
  return `${request.contentSha256}:${request.size.width}x${request.size.height}`;
}

function decodedBytes(size: Size2): number {
  return Math.max(0, size.width) * Math.max(0, size.height) * 4;
}

export class RasterDecodeCache {
  readonly #budgetBytes: number;
  readonly #decoder: RasterBitmapDecoder;
  readonly #diagnostics: RasterImageDiagnostics;
  readonly #entries = new Map<string, CacheEntry>();
  readonly #maxConcurrent: number;
  readonly #now: () => number;
  readonly #queue: CacheEntry[] = [];
  #activeDecodes = 0;
  #totalBytes = 0;

  constructor(options: RasterDecodeCacheOptions = {}) {
    this.#budgetBytes = Math.max(
      0,
      options.budgetBytes ?? defaultRasterDecodeBudgetBytes,
    );
    this.#decoder = options.decoder ?? decodeRasterBitmap;
    this.#diagnostics = options.diagnostics ?? rasterImageDiagnostics;
    this.#maxConcurrent = Math.max(
      1,
      options.maxConcurrent ?? defaultRasterDecodeConcurrency,
    );
    this.#now = options.now ?? (() => performance.now());
  }

  acquire(request: RasterDecodeRequest): RasterDecodeHandle {
    const key = cacheKey(request);
    let entry = this.#entries.get(key);
    if (entry === undefined) {
      let resolve!: (value: RasterDecodedImage) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<RasterDecodedImage>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      entry = {
        bytes: 0,
        contentSha256: request.contentSha256,
        dataUrl: request.dataUrl,
        resource: null,
        key,
        lastUsed: this.#now(),
        promise,
        refs: 0,
        reject,
        resolve,
        sessionId: null,
        size: request.size,
        state: "queued",
      };
      this.#entries.set(key, entry);
      this.#queue.push(entry);
      this.#pump();
    }

    entry.refs += 1;
    entry.lastUsed = this.#now();
    let released = false;
    return {
      promise: entry.promise,
      release: () => {
        if (released) return;
        released = true;
        entry!.refs = Math.max(0, entry!.refs - 1);
        entry!.lastUsed = this.#now();
        this.#evictIfNeeded();
      },
    };
  }

  clear(): void {
    const error = new Error("Raster decode cache was cleared.");
    for (const entry of this.#entries.values()) {
      if (entry.resource !== null) {
        entry.resource.close();
        if (entry.sessionId !== null) {
          this.#diagnostics.release(entry.sessionId);
        }
      } else {
        if (entry.sessionId !== null) {
          this.#diagnostics.fail(entry.sessionId);
        }
        entry.reject(error);
      }
    }
    this.#entries.clear();
    this.#queue.length = 0;
    this.#totalBytes = 0;
  }

  snapshot(): {
    readonly activeDecodes: number;
    readonly entryCount: number;
    readonly queuedDecodes: number;
    readonly totalBytes: number;
  } {
    return {
      activeDecodes: this.#activeDecodes,
      entryCount: this.#entries.size,
      queuedDecodes: this.#queue.length,
      totalBytes: this.#totalBytes,
    };
  }

  #pump(): void {
    while (
      this.#activeDecodes < this.#maxConcurrent &&
      this.#queue.length > 0
    ) {
      const entry = this.#queue.shift();
      if (entry === undefined || entry.state !== "queued") continue;
      entry.state = "decoding";
      entry.sessionId = this.#diagnostics.begin(
        entry.contentSha256,
        this.#now(),
      );
      this.#activeDecodes += 1;
      void this.#decoder({
        contentSha256: entry.contentSha256,
        dataUrl: entry.dataUrl,
        size: entry.size,
      })
        .then((resource) => {
          if (this.#entries.get(entry.key) !== entry) {
            resource.close();
            return;
          }
          entry.resource = resource;
          entry.bytes = decodedBytes({
            height: resource.height,
            width: resource.width,
          });
          entry.state = "ready";
          entry.lastUsed = this.#now();
          this.#totalBytes += entry.bytes;
          if (entry.sessionId !== null) {
            this.#diagnostics.complete(
              entry.sessionId,
              resource.width,
              resource.height,
              this.#now(),
            );
          }
          entry.resolve({
            height: resource.height,
            image: resource.image,
            width: resource.width,
          });
          this.#evictIfNeeded();
        })
        .catch((error: unknown) => {
          if (this.#entries.get(entry.key) === entry) {
            this.#entries.delete(entry.key);
          }
          if (entry.sessionId !== null) {
            this.#diagnostics.fail(entry.sessionId);
          }
          entry.reject(
            error instanceof Error
              ? error
              : new Error("Raster bitmap decode failed."),
          );
        })
        .finally(() => {
          this.#activeDecodes = Math.max(0, this.#activeDecodes - 1);
          this.#pump();
        });
    }
  }

  #evictIfNeeded(): void {
    if (this.#totalBytes <= this.#budgetBytes) return;
    const candidates = [...this.#entries.values()]
      .filter((entry) => entry.state === "ready" && entry.refs === 0)
      .sort((left, right) => left.lastUsed - right.lastUsed);

    for (const entry of candidates) {
      if (this.#totalBytes <= this.#budgetBytes) break;
      if (entry.resource === null) continue;
      this.#entries.delete(entry.key);
      this.#totalBytes = Math.max(0, this.#totalBytes - entry.bytes);
      entry.resource.close();
      if (entry.sessionId !== null) {
        this.#diagnostics.release(entry.sessionId);
      }
    }
  }
}

export const rasterDecodeCache = new RasterDecodeCache();
