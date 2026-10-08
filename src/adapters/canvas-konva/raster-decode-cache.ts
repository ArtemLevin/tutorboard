import type { BoardMediaContentSource, Size2 } from "../../core/public";

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

export type RasterDecodeRequest = {
  readonly contentSha256: string;
  readonly size: Size2;
} & (
  | { readonly dataUrl: string; readonly source?: never }
  | { readonly dataUrl?: never; readonly source: BoardMediaContentSource }
);

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
  signal: AbortSignal,
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
  readonly sourceIdentity: string;
  readonly request: RasterDecodeRequest;
  readonly controller: AbortController;
  readonly key: string;
  readonly promise: Promise<RasterDecodedImage>;
  readonly reject: (error: Error) => void;
  readonly resolve: (value: RasterDecodedImage) => void;
  bytes: number;
  discardWhenUnused: boolean;
  resource: RasterBitmapResource | null;
  lastUsed: number;
  refs: number;
  sessionId: number | null;
  state: "queued" | "decoding" | "ready" | "cancelled";
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

function embeddedDataUrlBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Embedded raster data URL is malformed.");
  }
  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const parts = metadata.split(";");
  const mimeType = parts[0] ?? "application/octet-stream";
  if (!parts.includes("base64")) {
    throw new Error("Embedded raster data URL must be base64 encoded.");
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
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

function decodeHtmlBlob(
  blob: Blob,
  signal: AbortSignal,
): Promise<RasterBitmapResource> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Raster decode cancelled.", "AbortError"));
      return;
    }
    const url = URL.createObjectURL(blob);
    const image = new Image();
    let finished = false;
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
      URL.revokeObjectURL(url);
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      image.src = "";
      reject(new DOMException("Raster decode cancelled.", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    image.decoding = "async";
    image.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("Raster image fallback decode failed."));
    };
    image.onload = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({
        close: () => {
          image.src = "";
        },
        height: image.naturalHeight,
        image,
        width: image.naturalWidth,
      });
    };
    image.src = url;
  });
}

async function decodeRasterBitmap(
  request: RasterDecodeRequest,
  signal: AbortSignal,
): Promise<RasterBitmapResource> {
  // Network authority errors must never enter the HTML fallback path.
  const blob =
    request.source === undefined
      ? embeddedDataUrlBlob(request.dataUrl)
      : await request.source.loadBlob(signal);
  if (signal.aborted) {
    throw new DOMException("Raster decode cancelled.", "AbortError");
  }
  try {
    const bitmap = await createImageBitmap(blob, {
      resizeHeight: request.size.height,
      resizeQuality: "high",
      resizeWidth: request.size.width,
    });
    if (signal.aborted) {
      bitmap.close();
      throw new DOMException("Raster decode cancelled.", "AbortError");
    }
    return {
      close: () => bitmap.close(),
      height: bitmap.height,
      image: bitmap,
      width: bitmap.width,
    };
  } catch (cause) {
    if (signal.aborted) throw cause;
    return request.source === undefined
      ? await decodeHtmlImage(request.dataUrl)
      : await decodeHtmlBlob(blob, signal);
  }
}

function sourceIdentity(request: RasterDecodeRequest): string {
  if (request.source !== undefined) return request.source.cacheKey;
  if (request.dataUrl !== undefined) return request.dataUrl;
  throw new Error("Raster decode request has no source.");
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
  readonly #entries = new Map<string, Map<string, CacheEntry>>();
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
    let sources = this.#entries.get(key);
    const identity = sourceIdentity(request);
    let entry = sources?.get(identity);
    if (entry === undefined) {
      let resolve!: (value: RasterDecodedImage) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<RasterDecodedImage>(
        (resolvePromise, rejectPromise) => {
          resolve = resolvePromise;
          reject = rejectPromise;
        },
      );
      entry = {
        bytes: 0,
        contentSha256: request.contentSha256,
        discardWhenUnused: false,
        controller: new AbortController(),
        sourceIdentity: identity,
        request,
        resource: null,
        key,
        lastUsed: this.#now(),
        promise,
        refs: 0,
        reject,
        resolve,
        sessionId: null,
        state: "queued",
      };
      if (sources === undefined) {
        sources = new Map<string, CacheEntry>();
        this.#entries.set(key, sources);
      }
      sources.set(identity, entry);
      this.#queue.push(entry);
      this.#pump();
    }

    const acquiredEntry = entry;
    acquiredEntry.discardWhenUnused = false;
    acquiredEntry.refs += 1;
    acquiredEntry.lastUsed = this.#now();
    let released = false;
    return {
      promise: acquiredEntry.promise,
      release: () => {
        if (released) return;
        released = true;
        acquiredEntry.refs = Math.max(0, acquiredEntry.refs - 1);
        acquiredEntry.lastUsed = this.#now();
        if (
          acquiredEntry.refs === 0 &&
          acquiredEntry.request.source !== undefined &&
          acquiredEntry.state !== "ready"
        ) {
          this.#cancelUnusedAsset(acquiredEntry);
        }
        this.#evictIfNeeded();
      },
    };
  }

  clear(): void {
    const error = new Error("Raster decode cache was cleared.");
    for (const sources of this.#entries.values()) {
      for (const entry of sources.values()) {
        entry.controller.abort();
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
    }
    this.#entries.clear();
    this.#queue.length = 0;
    this.#totalBytes = 0;
  }

  trimUnused(): void {
    for (const sources of [...this.#entries.values()]) {
      for (const entry of [...sources.values()]) {
        if (entry.refs !== 0) continue;
        if (entry.state !== "ready" || entry.resource === null) {
          if (entry.request.source !== undefined) {
            this.#cancelUnusedAsset(entry);
          } else {
            entry.discardWhenUnused = true;
          }
          continue;
        }
        this.#releaseReadyEntry(entry);
      }
    }
  }

  snapshot(): {
    readonly activeDecodes: number;
    readonly activeReferences: number;
    readonly entryCount: number;
    readonly pendingEntries: number;
    readonly queuedDecodes: number;
    readonly retainedBytes: number;
    readonly retainedEntryCount: number;
    readonly totalBytes: number;
  } {
    const entries = [...this.#entries.values()].flatMap((sources) => [
      ...sources.values(),
    ]);
    const retained = entries.filter(
      (entry) => entry.state === "ready" && entry.refs === 0,
    );
    return {
      activeDecodes: this.#activeDecodes,
      activeReferences: entries.reduce((sum, entry) => sum + entry.refs, 0),
      entryCount: entries.length,
      pendingEntries: entries.filter(
        (entry) => entry.state === "decoding" || entry.state === "queued",
      ).length,
      queuedDecodes: this.#queue.length,
      retainedBytes: retained.reduce((sum, entry) => sum + entry.bytes, 0),
      retainedEntryCount: retained.length,
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
      void this.#decoder(entry.request, entry.controller.signal)
        .then((resource) => {
          if (this.#entryFor(entry) !== entry) {
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
          if (entry.discardWhenUnused && entry.refs === 0) {
            this.#releaseReadyEntry(entry);
          } else {
            this.#evictIfNeeded();
          }
        })
        .catch((error: unknown) => {
          if (this.#entryFor(entry) === entry) {
            this.#deleteEntry(entry);
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

  #entryFor(entry: CacheEntry): CacheEntry | undefined {
    return this.#entries.get(entry.key)?.get(entry.sourceIdentity);
  }

  #deleteEntry(entry: CacheEntry): void {
    const sources = this.#entries.get(entry.key);
    if (sources === undefined) return;
    sources.delete(entry.sourceIdentity);
    if (sources.size === 0) this.#entries.delete(entry.key);
  }

  #cancelUnusedAsset(entry: CacheEntry): void {
    if (this.#entryFor(entry) !== entry) return;
    this.#deleteEntry(entry);
    entry.state = "cancelled";
    entry.controller.abort();
    if (entry.sessionId !== null) {
      this.#diagnostics.fail(entry.sessionId);
      entry.sessionId = null;
    }
    entry.reject(new DOMException("Raster decode cancelled.", "AbortError"));
  }

  #releaseReadyEntry(entry: CacheEntry): void {
    const resource = entry.resource;
    if (resource === null) return;
    this.#deleteEntry(entry);
    this.#totalBytes = Math.max(0, this.#totalBytes - entry.bytes);
    resource.close();
    entry.resource = null;
    if (entry.sessionId !== null) {
      this.#diagnostics.release(entry.sessionId);
      entry.sessionId = null;
    }
  }

  #evictIfNeeded(): void {
    if (this.#totalBytes <= this.#budgetBytes) return;
    const candidates = [...this.#entries.values()]
      .flatMap((sources) => [...sources.values()])
      .filter((entry) => entry.state === "ready" && entry.refs === 0)
      .sort((left, right) => left.lastUsed - right.lastUsed);

    for (const entry of candidates) {
      if (this.#totalBytes <= this.#budgetBytes) break;
      if (entry.resource === null) continue;
      this.#releaseReadyEntry(entry);
    }
  }
}

export const rasterDecodeCache = new RasterDecodeCache();
