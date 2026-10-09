import type {
  BoardMediaContentSource,
  MediaAssetObject,
} from "../../core/public";

/**
 * A registry-local, bounded identity cache for synchronous media resolvers.
 * It never retains decoded bitmap resources or Blob URLs.
 */
export class MediaSourceCache {
  readonly #entries = new Map<
    string,
    {
      readonly contentSha256: string;
      readonly mimeType: string;
      readonly source: BoardMediaContentSource;
    }
  >();
  readonly #maxEntries: number;
  readonly #retiredSourceKeys = new Set<string>();

  constructor(maxEntries = 256) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("Media source cache capacity must be positive.");
    }
    this.#maxEntries = maxEntries;
  }

  resolve(
    asset: MediaAssetObject,
    resolver: (asset: MediaAssetObject) => BoardMediaContentSource,
  ): BoardMediaContentSource {
    const resolved = resolver(asset);
    const existing = this.#entries.get(asset.assetId);
    const source =
      existing?.contentSha256 === asset.contentSha256 &&
      existing.mimeType === asset.mimeType &&
      existing.source.cacheKey === resolved.cacheKey
        ? existing.source
        : resolved;

    if (existing !== undefined && existing.source !== source) {
      this.#retiredSourceKeys.add(existing.source.cacheKey);
    }
    this.#entries.delete(asset.assetId);
    this.#entries.set(asset.assetId, {
      contentSha256: asset.contentSha256,
      mimeType: asset.mimeType,
      source,
    });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
    return source;
  }

  delete(assetId: string): void {
    const entry = this.#entries.get(assetId);
    if (entry !== undefined) this.#retiredSourceKeys.add(entry.source.cacheKey);
    this.#entries.delete(assetId);
  }

  retain(activeAssetIds: ReadonlySet<string>): void {
    for (const assetId of this.#entries.keys()) {
      if (!activeAssetIds.has(assetId)) this.delete(assetId);
    }
  }

  clear(): void {
    for (const assetId of this.#entries.keys()) this.delete(assetId);
  }

  drainRetiredSourceKeys(): readonly string[] {
    const retired = [...this.#retiredSourceKeys];
    this.#retiredSourceKeys.clear();
    return retired;
  }

  snapshot(): { readonly entryCount: number; readonly maxEntries: number } {
    return { entryCount: this.#entries.size, maxEntries: this.#maxEntries };
  }
}
