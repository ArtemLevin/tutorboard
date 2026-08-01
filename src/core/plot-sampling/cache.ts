import {
  coordinatePlotSamplerVersion,
  maximumSamplingCacheEntries,
} from "./limits";
import type { PlotSamplingCache, SampledPlotSeries } from "./types";

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(36);
}

function canonicalNumber(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isFinite(value) ? value.toPrecision(17) : String(value);
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === "number") return canonicalNumber(value);
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function createPlotSamplingCacheKey(value: unknown): string {
  const canonical = JSON.stringify(canonicalValue(value));
  return `${coordinatePlotSamplerVersion}:${fnv1a64(canonical)}:${canonical}`;
}

export function createPlotSamplingCache(
  maximumEntries = maximumSamplingCacheEntries,
): PlotSamplingCache {
  const requestedEntries = Number.isFinite(maximumEntries)
    ? maximumEntries
    : maximumSamplingCacheEntries;
  const entryLimit = Math.max(
    1,
    Math.min(maximumSamplingCacheEntries, Math.floor(requestedEntries)),
  );
  const entries = new Map<string, SampledPlotSeries>();

  return {
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > entryLimit) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        entries.delete(oldestKey);
      }
    },
  };
}
