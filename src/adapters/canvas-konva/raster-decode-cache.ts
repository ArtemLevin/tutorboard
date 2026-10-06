import type { Size2 } from "../../core/public";

import {
  rasterImageDiagnostics,
  type RasterImageDiagnostics,
} from "./raster-image-diagnostics";

export const defaultRasterDecodeBudgetBytes = 128 * 1024 * 1024;
export const defaultRasterDecodeConcurrency = 2;
const minimumRasterBucketPixels = 64;

export interface RasterDecodeSizeInput {
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

export interface RasterDecodedImage {
  readonly height: number;
  readonly image: ImageBitmap;
  readonly width: number;
}

export interface RasterDecodeHandle {
  readonly promise: Promise<RasterDecodedImage>;
  release(): void;
}

export type RasterBitmapDecoder = (
  request: RasterDecodeRequest,
) => Promise<ImageBitmap>;

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
  image: ImageBitmap | null;
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
    Math.max(0, zoom) *
    Math.max(1, devicePixelRatio);
  const effectiveHeight =
    displaySize.height *
    Math.max(0, Math.abs(objectScale.y)) *
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

async function decodeRasterBitmap(
  request: RasterDecodeRequest,
): Promise<ImageBitmap> {
  const response = await fetch(request.dataUrl);
  if (!response.ok) {
    throw new Error(`Raster source fetch failed: ${response.status}`);
  }
  const blob = await response.blob();
  return await createImageBitmap(blob, {
    resizeHeight: request.size.height,
    resizeQuality: "high",
    resizeWidth: request.size.width,
  });
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
        image: null,
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
    for (const entry of this.#entries.values()) {
      if (entry.image !== null) {
        entry.image.close();
        if (entry.sessionId !== null) {
          this.#diagnostics.release(entry.sessionId);
        }
      } else if (entry.sessionId !== null) {
        this.#diagnostics.fail(entry.sessionId);
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
        .then((image) => {
          if (this.#entries.get(entry.key) !== entry) {
            image.close();
            return;
          }
          entry.image = image;
          entry.bytes = decodedBytes({
            height: image.height,
            width: image.width,
          });
          entry.state = "ready";
          entry.lastUsed = this.#now();
          this.#totalBytes += entry.bytes;
          if (entry.sessionId !== null) {
            this.#diagnostics.complete(
              entry.sessionId,
              image.width,
              image.height,
              this.#now(),
            );
          }
          entry.resolve({
            height: image.height,
            image,
            width: image.width,
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
      if (entry.image === null) continue;
      this.#entries.delete(entry.key);
      this.#totalBytes = Math.max(0, this.#totalBytes - entry.bytes);
      entry.image.close();
      if (entry.sessionId !== null) {
        this.#diagnostics.release(entry.sessionId);
      }
    }
  }
}

export const rasterDecodeCache = new RasterDecodeCache();
