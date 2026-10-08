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
    { readonly contentSha256: string; readonly source: BoardMediaContentSource }
  >();
  readonly #maxEntries: number;

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
      existing.source.cacheKey === resolved.cacheKey
        ? existing.source
        : resolved;

    this.#entries.delete(asset.assetId);
    this.#entries.set(asset.assetId, {
      contentSha256: asset.contentSha256,
      source,
    });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
    return source;
  }

  delete(assetId: string): void {
    this.#entries.delete(assetId);
  }

  retain(activeAssetIds: ReadonlySet<string>): void {
    for (const assetId of this.#entries.keys()) {
      if (!activeAssetIds.has(assetId)) this.#entries.delete(assetId);
    }
  }

  clear(): void {
    this.#entries.clear();
  }

  snapshot(): { readonly entryCount: number; readonly maxEntries: number } {
    return { entryCount: this.#entries.size, maxEntries: this.#maxEntries };
  }
}
