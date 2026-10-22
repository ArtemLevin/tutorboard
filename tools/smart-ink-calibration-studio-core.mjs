import {
  mergeSmartInkGlyphCorpora,
  parseSmartInkGlyphCorpus,
  smartInkGlyphCorpusVersion,
} from "./smart-ink-glyph-corpus.mjs";

export const studioLocalSchema = "tutorboard.smart-ink-calibration-studio/1";
export const geometryLegacySchema = "tutorboard.smart-ink-corpus/0.1";
const legacyKinds = ["line", "circle", "ellipse", "rectangle", "square", "triangle"];
const profiles = ["windows-desktop", "windows-laptop", "tablet", "other-device"];
const browsers = ["chromium", "firefox", "other"];
const pointers = ["mouse", "pen", "touch"];
const record = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const validCode = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{3,39}$/.test(value);
const finite = (value, min, max) => typeof value === "number" &&
  Number.isFinite(value) && value >= min && value <= max;
const envelope = (samples) =>
  parseSmartInkGlyphCorpus({ schemaVersion: smartInkGlyphCorpusVersion, samples });

export function emptyStudioCorpus() {
  return envelope([]);
}

/** All imported samples are subject to the same strict limits as native capture. */
export function mergeStudioCorpus(existing, incoming, metadata, idFactory) {
  const first = envelope(existing.samples);
  const candidate = incoming?.schemaVersion === geometryLegacySchema
    ? convertLegacyGeometryCorpus(incoming, metadata, idFactory)
    : parseSmartInkGlyphCorpus(incoming);
  return mergeSmartInkGlyphCorpora(first, candidate);
}

function stableLegacyId(value) {
  const hash = (seed) => {
    let state = seed;
    for (const point of value) state = Math.imul(state ^ point.codePointAt(0), 16777619);
    return (state >>> 0).toString(16).padStart(8, "0");
  };
  return "legacy-" + hash(2166136261) + hash(1804573);
}

export function convertLegacyGeometryCorpus(input, metadata, idFactory) {
  if (!record(input) || input.schemaVersion !== geometryLegacySchema ||
    !Array.isArray(input.samples) || input.samples.length > 2_000 ||
    !record(metadata) || !validCode(metadata.writerId) ||
    !validCode(metadata.deviceId) || !profiles.includes(metadata.deviceProfile) ||
    !browsers.includes(metadata.browser) || typeof idFactory !== "function") {
    throw new TypeError("Invalid legacy geometry corpus or contributor metadata.");
  }
  const seen = new Set();
  const result = input.samples.map((sample) => {
    if (!record(sample) || typeof sample.id !== "string" ||
      sample.id.length < 1 || sample.id.length > 160 || seen.has(sample.id) ||
      typeof sample.expectedKind !== "string" ||
      ![...legacyKinds, "negative"].includes(sample.expectedKind) ||
      !Array.isArray(sample.points) ||
      sample.points.length < 2 || sample.points.length > 4_096 ||
      !record(sample.metadata) || !pointers.includes(sample.metadata.pointerType) ||
      !finite(sample.metadata.durationMs, 0, 300_000)) {
      throw new TypeError("Unsupported legacy geometric sample.");
    }
    seen.add(sample.id);
    const points = sample.points.map((point, index) => {
      if (!record(point) || !finite(point.x, 0, 2_000) ||
        !finite(point.y, 0, 2_000)) {
        throw new TypeError("Invalid legacy point.");
      }
      return {
        x: point.x, y: point.y,
        timeMs: Math.round(index * sample.metadata.durationMs /
          Math.max(1, sample.points.length - 1)),
        pressure: 0.5,
      };
    });
    return {
      id: stableLegacyId(sample.id),
      writerId: metadata.writerId,
      deviceId: metadata.deviceId,
      deviceProfile: metadata.deviceProfile,
      browser: metadata.browser,
      pointerType: sample.metadata.pointerType,
      labelStatus: "unreviewed",
      provenance: "captured",
      target: sample.expectedKind === "negative"
        ? { kind: "ordinary-ink" }
        : { kind: "shape", shape: sample.expectedKind },
      strokes: [{ points }],
    };
  });
  return envelope(result);
}

/** Export only one-stroke geometry compatible with old calibration tooling. */
export function exportLegacyGeometryCorpus(input) {
  const corpus = parseSmartInkGlyphCorpus(input);
  const samples = corpus.samples.flatMap((sample) => {
    const shape = sample.target.kind === "shape" ? sample.target.shape : null;
    if (shape !== null && !legacyKinds.includes(shape)) return [];
    if (sample.target.kind === "glyph" || sample.strokes.length !== 1) return [];
    const points = sample.strokes[0].points;
    if (points.length < 2) return [];
    const expectedKind = shape === null ? "negative" : shape;
    return [{
      id: sample.id,
      expectedKind,
      acceptableKinds: shape === null ? [] : [shape],
      metadata: {
        browser: sample.browser,
        deviceProfile: sample.deviceProfile,
        durationMs: points.at(-1).timeMs - points[0].timeMs,
        pointerType: sample.pointerType,
      },
      points: points.map(({ x, y }) => ({ x, y })),
      provenance: "captured",
      shouldPropose: shape !== null,
    }];
  });
  return { schemaVersion: geometryLegacySchema, samples };
}

/**
 * Editing preserves input trajectories and marks the label as unreviewed.
 * Independent review must happen outside the single-author capture UI.
 */
export function relabelStudioSample(corpus, id, target) {
  const previous = parseSmartInkGlyphCorpus(corpus);
  if (!previous.samples.some((sample) => sample.id === id)) {
    throw new TypeError("Unknown studio sample.");
  }
  const updated = previous.samples.map((sample) => sample.id === id
    ? { ...sample, target, labelStatus: "unreviewed" }
    : sample);
  return envelope(updated);
}

export function removeStudioSample(corpus, id) {
  const previous = parseSmartInkGlyphCorpus(corpus);
  return envelope(previous.samples.filter((sample) => sample.id !== id));
}

export function parseStudioBackup(value) {
  if (!record(value) || value.schemaVersion !== studioLocalSchema ||
    !record(value.corpus)) throw new TypeError("Invalid studio backup.");
  return parseSmartInkGlyphCorpus(value.corpus);
}
