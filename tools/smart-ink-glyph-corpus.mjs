/**
 * Shared browser/Node contract for explicitly labelled Smart Ink glyph traces.
 * Captures stay in memory until the user initiates a JSON download.
 */
export const smartInkGlyphCorpusVersion = "tutorboard.smart-ink-glyph-corpus/1";

export const glyphCharacterSets = Object.freeze({
  Cyrl: [..."АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя"],
  Latn: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"],
  Grek: [..."ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω".concat("ς")],
  Zyyy: [..."0123456789"],
});
export const glyphShapeNegatives = Object.freeze([
  "line", "circle", "ellipse", "rectangle", "square", "triangle", "arrow",
]);
export const smartInkGlyphCorpusLimits = Object.freeze({
  samples: 2_000,
  strokes: 12,
  pointsPerStroke: 4_096,
  totalPoints: 16_384,
  durationMs: 300_000,
  coordinates: 2_000,
});
const browsers = ["chromium", "firefox", "other"];
const deviceProfiles = ["windows-desktop", "windows-laptop", "tablet", "other-device"];
const pointers = ["mouse", "pen", "touch"];
const keys = (object, expected) =>
  Object.keys(object).sort().join("|") === [...expected].sort().join("|");
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const code = (value) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9_-]{3,39}$/.test(value);
const positive = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

export function targetForGlyph(script, character) {
  if (!Object.hasOwn(glyphCharacterSets, script) ||
      !glyphCharacterSets[script].includes(character)) {
    throw new TypeError("Unsupported glyph/script pair.");
  }
  return { kind: "glyph", script, character };
}

function validateTarget(value) {
  if (!record(value) || typeof value.kind !== "string") {
    throw new TypeError("Invalid glyph corpus target.");
  }
  if (value.kind === "glyph") {
    if (!keys(value, ["kind", "script", "character"])) {
      throw new TypeError("Unexpected glyph target fields.");
    }
    targetForGlyph(value.script, value.character);
    return;
  }
  if (value.kind === "shape" && keys(value, ["kind", "shape"]) &&
      glyphShapeNegatives.includes(value.shape)) return;
  if (value.kind === "ordinary-ink" && keys(value, ["kind"])) return;
  throw new TypeError("Invalid negative target.");
}

export function parseSmartInkGlyphCorpus(input) {
  if (!record(input) ||
      !keys(input, ["schemaVersion", "samples"]) ||
      input.schemaVersion !== smartInkGlyphCorpusVersion ||
      !Array.isArray(input.samples) ||
      input.samples.length > smartInkGlyphCorpusLimits.samples) {
    throw new TypeError("Invalid Smart Ink glyph corpus envelope.");
  }
  const seen = new Set();
  for (const sample of input.samples) {
    if (!record(sample) || !keys(sample, [
      "id", "writerId", "deviceId", "deviceProfile", "browser",
      "pointerType", "labelStatus", "provenance", "target", "strokes",
    ]) || !code(sample.id) || !code(sample.writerId) ||
      !code(sample.deviceId) || seen.has(sample.id) ||
      !deviceProfiles.includes(sample.deviceProfile) ||
      !browsers.includes(sample.browser) ||
      !pointers.includes(sample.pointerType) ||
      !["unreviewed", "reviewed"].includes(sample.labelStatus) ||
      sample.provenance !== "captured") {
      throw new TypeError("Invalid or duplicate Smart Ink glyph corpus sample.");
    }
    seen.add(sample.id);
    validateTarget(sample.target);
    if (!Array.isArray(sample.strokes) ||
        sample.strokes.length < 1 ||
        sample.strokes.length > smartInkGlyphCorpusLimits.strokes) {
      throw new TypeError("Invalid glyph stroke count.");
    }
    let totalPoints = 0;
    let lastTime = -1;
    for (const stroke of sample.strokes) {
      if (!record(stroke) || !keys(stroke, ["points"]) ||
          !Array.isArray(stroke.points) ||
          stroke.points.length < 1 ||
          stroke.points.length > smartInkGlyphCorpusLimits.pointsPerStroke) {
        throw new TypeError("Invalid glyph stroke.");
      }
      totalPoints += stroke.points.length;
      if (totalPoints > smartInkGlyphCorpusLimits.totalPoints) {
        throw new TypeError("Glyph sample exceeds point limit.");
      }
      for (const point of stroke.points) {
        if (!record(point) || !keys(point, ["x", "y", "timeMs", "pressure"]) ||
            !positive(point.x, 0, smartInkGlyphCorpusLimits.coordinates) ||
            !positive(point.y, 0, smartInkGlyphCorpusLimits.coordinates) ||
            !positive(point.timeMs, lastTime < 0 ? 0 : lastTime,
              smartInkGlyphCorpusLimits.durationMs) ||
            !positive(point.pressure, 0, 1)) {
          throw new TypeError("Invalid or nonmonotonic glyph point.");
        }
        lastTime = point.timeMs;
      }
    }
  }
  return input;
}

export function mergeSmartInkGlyphCorpora(existing, incoming) {
  const a = parseSmartInkGlyphCorpus(existing);
  const b = parseSmartInkGlyphCorpus(incoming);
  const merged = {
    schemaVersion: smartInkGlyphCorpusVersion,
    samples: [...a.samples, ...b.samples],
  };
  return parseSmartInkGlyphCorpus(merged);
}

export function summarizeSmartInkGlyphCorpus(corpus) {
  const valid = parseSmartInkGlyphCorpus(corpus);
  const scripts = { Cyrl: 0, Latn: 0, Grek: 0, Zyyy: 0 };
  const classes = Object.fromEntries(
    Object.entries(glyphCharacterSets).flatMap(([script, chars]) =>
      chars.map((character) => [script + ":" + character, 0])),
  );
  let negatives = 0;
  let unreviewed = 0;
  for (const sample of valid.samples) {
    if (sample.labelStatus !== "reviewed") unreviewed += 1;
    if (sample.target.kind !== "glyph") {
      negatives += 1;
    } else {
      scripts[sample.target.script] += 1;
      classes[sample.target.script + ":" + sample.target.character] += 1;
    }
  }
  return {
    total: valid.samples.length,
    writers: new Set(valid.samples.map(({ writerId }) => writerId)).size,
    devices: new Set(valid.samples.map(({ deviceId }) => deviceId)).size,
    scripts,
    negatives,
    unreviewed,
    coveredClasses: Object.values(classes).filter((n) => n > 0).length,
    expectedClasses: Object.keys(classes).length,
    classCounts: classes,
  };
}

/** Disjoint by connected components of writer IDs and device IDs. */
export function splitSmartInkGlyphCorpus(corpus) {
  const valid = parseSmartInkGlyphCorpus(corpus);
  if (valid.samples.some(({ labelStatus }) => labelStatus !== "reviewed")) {
    throw new Error("Independent splits require reviewed samples.");
  }
  const parent = valid.samples.map((_, index) => index);
  const root = (index) => {
    while (index !== parent[index]) {
      index = parent[index];
    }
    return index;
  };
  const union = (a, b) => {
    const x = root(a);
    const y = root(b);
    if (x !== y) parent[y] = x;
  };
  const writer = new Map();
  const device = new Map();
  valid.samples.forEach((sample, index) => {
    const firstWriter = writer.get(sample.writerId);
    const firstDevice = device.get(sample.deviceId);
    if (firstWriter !== undefined) union(firstWriter, index);
    if (firstDevice !== undefined) union(firstDevice, index);
    writer.set(sample.writerId, index);
    device.set(sample.deviceId, index);
  });
  const grouped = new Map();
  valid.samples.forEach((sample, index) => {
    const key = root(index);
    const items = grouped.get(key) ?? [];
    items.push(sample);
    grouped.set(key, items);
  });
  const groups = [...grouped.values()].sort(
    (left, right) =>
      right.length - left.length ||
      left.map(({ id }) => id).sort()[0].localeCompare(
        right.map(({ id }) => id).sort()[0],
      ),
  );
  if (groups.length < 3) {
    throw new Error("Three independent writer/device components are required.");
  }
  const names = ["train", "calibration", "holdout"];
  const ratios = { train: 0.7, calibration: 0.15, holdout: 0.15 };
  const sets = { train: [], calibration: [], holdout: [] };
  groups.forEach((group, index) => {
    const choice = index < 3
      ? names[index]
      : names.reduce((best, name) =>
          sets[name].length / ratios[name] < sets[best].length / ratios[best]
            ? name : best);
    sets[choice].push(...group);
  });
  const result = Object.fromEntries(
    names.map((name) => [name, {
      schemaVersion: smartInkGlyphCorpusVersion,
      samples: sets[name].sort((a, b) => a.id.localeCompare(b.id)),
    }]),
  );
  return {
    ...result,
    summary: Object.fromEntries(names.map((name) => [
      name, summarizeSmartInkGlyphCorpus(result[name]),
    ])),
  };
}
