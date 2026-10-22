import type { SmartInkGlyphScript } from "./unified";

/**
 * Small deterministic *experimental* nearest-centroid baseline for SI-G04.
 * Distances are NOT confidence/probabilities and MUST NOT drive auto-replace.
 */
export const smartInkGlyphPrototypeSchema =
  "tutorboard.smart-ink-glyph-prototype/1" as const;
export const smartInkGlyphPrototypeFeatureVersion =
  "grid12-strokes-v1" as const;
const gridSize = 12;
const rasterLength = gridSize * gridSize;
export const smartInkGlyphPrototypeFeatureCount = rasterLength + 3;
const maximumStrokes = 12;
const maximumPointsPerStroke = 4_096;
const maximumTotalPoints = 16_384;
const maximumClasses = 177;
const maximumSamples = 2_000;

export interface GlyphPrototypePoint {
  readonly x: number;
  readonly y: number;
}
export interface GlyphPrototypeStroke {
  readonly points: readonly GlyphPrototypePoint[];
}
export interface GlyphPrototypeExample {
  readonly character: string;
  readonly script: SmartInkGlyphScript;
  readonly strokes: readonly GlyphPrototypeStroke[];
}
export interface GlyphPrototypeClass {
  readonly character: string;
  readonly count: number;
  readonly features: readonly number[];
  readonly script: SmartInkGlyphScript;
}
export interface GlyphPrototypeModel {
  readonly calibrated: false;
  readonly classes: readonly GlyphPrototypeClass[];
  readonly featureVersion: typeof smartInkGlyphPrototypeFeatureVersion;
  readonly schemaVersion: typeof smartInkGlyphPrototypeSchema;
}
export interface GlyphPrototypeRank {
  readonly character: string;
  /** Squared feature-space distance; smaller is closer. NOT probability. */
  readonly distance: number;
  readonly script: SmartInkGlyphScript;
}
export interface GlyphPrototypeResult {
  readonly candidates: readonly GlyphPrototypeRank[];
  readonly modelVersion: typeof smartInkGlyphPrototypeSchema;
  readonly status: "uncalibrated";
}

function isGlyph(script: SmartInkGlyphScript, character: string): boolean {
  if (
    Array.from(character).length !== 1 ||
    character !== character.normalize("NFC")
  ) {
    return false;
  }
  switch (script) {
    case "Cyrl":
      return /^[А-Яа-яЁё]$/u.test(character);
    case "Latn":
      return /^[A-Za-z]$/u.test(character);
    case "Grek":
      return /^[Α-ΡΣ-Ωα-ω]$/u.test(character);
    case "Zyyy":
      return /^[0-9]$/u.test(character);
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

export function extractGlyphPrototypeFeatures(
  strokes: readonly GlyphPrototypeStroke[],
): readonly number[] {
  if (strokes.length === 0 || strokes.length > maximumStrokes) {
    throw new TypeError("Invalid glyph stroke count.");
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let pointCount = 0;
  for (const stroke of strokes) {
    if (
      stroke.points.length === 0 ||
      stroke.points.length > maximumPointsPerStroke
    ) {
      throw new TypeError("Invalid glyph stroke size.");
    }
    pointCount += stroke.points.length;
    if (pointCount > maximumTotalPoints)
      throw new TypeError("Glyph point budget exceeded.");
    for (const { x, y } of stroke.points) {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        Math.abs(x) > 1_000_000 ||
        Math.abs(y) > 1_000_000
      ) {
        throw new TypeError("Invalid glyph coordinates.");
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.max(width, height, 1e-6);
  const offsetX = ((gridSize - 1) * (1 - width / scale)) / 2;
  const offsetY = ((gridSize - 1) * (1 - height / scale)) / 2;
  const output = Array.from(
    { length: smartInkGlyphPrototypeFeatureCount },
    () => 0,
  );
  const cell = (x: number, y: number) => {
    const gx = Math.max(
      0,
      Math.min(
        gridSize - 1,
        Math.round(((x - minX) / scale) * (gridSize - 1) + offsetX),
      ),
    );
    const gy = Math.max(
      0,
      Math.min(
        gridSize - 1,
        Math.round(((y - minY) / scale) * (gridSize - 1) + offsetY),
      ),
    );
    output[gy * gridSize + gx] = 1;
  };
  for (const stroke of strokes) {
    let previous: GlyphPrototypePoint | undefined;
    for (const current of stroke.points) {
      if (previous === undefined) {
        cell(current.x, current.y);
      } else {
        const distance = Math.hypot(
          current.x - previous.x,
          current.y - previous.y,
        );
        const steps = Math.max(
          1,
          Math.min(64, Math.ceil((distance / scale) * (gridSize - 1) * 2)),
        );
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          cell(
            previous.x + (current.x - previous.x) * t,
            previous.y + (current.y - previous.y) * t,
          );
        }
      }
      previous = current;
    }
  }
  output[rasterLength] = strokes.length / maximumStrokes;
  output[rasterLength + 1] = width / scale;
  output[rasterLength + 2] = height / scale;
  return output;
}

export function trainGlyphPrototypeModel(
  examples: readonly GlyphPrototypeExample[],
): GlyphPrototypeModel {
  if (examples.length < 2 || examples.length > maximumSamples) {
    throw new TypeError(
      "Prototype training requires 2–2000 reviewed examples.",
    );
  }
  const accumulators = new Map<
    string,
    {
      script: SmartInkGlyphScript;
      character: string;
      features: number[];
      count: number;
    }
  >();
  for (const example of examples) {
    if (!isGlyph(example.script, example.character))
      throw new TypeError("Unsupported glyph class.");
    const features = extractGlyphPrototypeFeatures(example.strokes);
    const key = example.script + ":" + example.character;
    const row = accumulators.get(key) ?? {
      script: example.script,
      character: example.character,
      count: 0,
      features: Array.from(
        { length: smartInkGlyphPrototypeFeatureCount },
        () => 0,
      ),
    };
    for (let i = 0; i < features.length; i += 1)
      row.features[i]! += features[i]!;
    row.count += 1;
    accumulators.set(key, row);
  }
  if (accumulators.size < 2)
    throw new TypeError("Prototype needs at least two glyph classes.");
  return {
    calibrated: false,
    classes: [...accumulators.values()]
      .map((row) => ({
        script: row.script,
        character: row.character,
        count: row.count,
        features: row.features.map((value) => value / row.count),
      }))
      .sort(
        (a, b) =>
          a.script.localeCompare(b.script) ||
          a.character.localeCompare(b.character),
      ),
    featureVersion: smartInkGlyphPrototypeFeatureVersion,
    schemaVersion: smartInkGlyphPrototypeSchema,
  };
}

/** Untrusted model files must pass a strict bounded, no-extra-fields parser. */
export function parseGlyphPrototypeModel(input: unknown): GlyphPrototypeModel {
  if (
    !isRecord(input) ||
    !exactKeys(input, [
      "calibrated",
      "classes",
      "featureVersion",
      "schemaVersion",
    ]) ||
    input.calibrated !== false ||
    input.featureVersion !== smartInkGlyphPrototypeFeatureVersion ||
    input.schemaVersion !== smartInkGlyphPrototypeSchema ||
    !Array.isArray(input.classes) ||
    input.classes.length < 2 ||
    input.classes.length > maximumClasses
  ) {
    throw new TypeError("Invalid glyph prototype artifact.");
  }
  const classes: GlyphPrototypeClass[] = [];
  let totalCount = 0;
  const seen = new Set<string>();
  for (const row of input.classes) {
    if (
      !isRecord(row) ||
      !exactKeys(row, ["script", "character", "count", "features"]) ||
      typeof row.script !== "string" ||
      !["Cyrl", "Latn", "Grek", "Zyyy"].includes(row.script) ||
      typeof row.character !== "string"
    )
      throw new TypeError("Invalid glyph prototype class.");
    const script = row.script as SmartInkGlyphScript;
    if (
      !isGlyph(script, row.character) ||
      seen.has(script + ":" + row.character) ||
      typeof row.count !== "number" ||
      !Number.isSafeInteger(row.count) ||
      row.count < 1 ||
      row.count > maximumSamples ||
      !Array.isArray(row.features) ||
      row.features.length !== smartInkGlyphPrototypeFeatureCount ||
      !row.features.every(
        (value: unknown) =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 1,
      )
    ) {
      throw new TypeError(
        "Invalid glyph prototype features or duplicate class.",
      );
    }
    seen.add(script + ":" + row.character);
    totalCount += row.count;
    classes.push({
      script,
      character: row.character,
      count: row.count,
      features: [...row.features],
    });
  }
  if (totalCount > maximumSamples)
    throw new TypeError("Glyph prototype exceeds sample budget.");
  return {
    calibrated: false,
    classes,
    featureVersion: smartInkGlyphPrototypeFeatureVersion,
    schemaVersion: smartInkGlyphPrototypeSchema,
  };
}

export function rankGlyphPrototype(
  model: GlyphPrototypeModel,
  strokes: readonly GlyphPrototypeStroke[],
  scriptHint: SmartInkGlyphScript | "auto" = "auto",
): GlyphPrototypeResult {
  const features = extractGlyphPrototypeFeatures(strokes);
  const candidates: GlyphPrototypeRank[] = model.classes
    .filter((row) => scriptHint === "auto" || row.script === scriptHint)
    .map(({ script, character, features: centroid }) => {
      let distance = 0;
      for (let i = 0; i < features.length; i += 1) {
        const delta = features[i]! - centroid[i]!;
        distance += delta * delta;
      }
      return { script, character, distance };
    })
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.script.localeCompare(b.script) ||
        a.character.localeCompare(b.character),
    )
    .slice(0, 3);
  return {
    status: "uncalibrated",
    candidates,
    modelVersion: smartInkGlyphPrototypeSchema,
  };
}

export interface SmartInkGlyphPrototypeProvider {
  recognize(
    strokes: readonly GlyphPrototypeStroke[],
    options: {
      readonly signal: AbortSignal;
      readonly scriptHint?: SmartInkGlyphScript | "auto";
    },
  ): Promise<GlyphPrototypeResult>;
}

/**
 * Provider boundary for next-phase async worker integration.
 * Current small prototype scores synchronously; never call on the paint path.
 */
export function createGlyphPrototypeProvider(
  untrustedModel: unknown,
): SmartInkGlyphPrototypeProvider {
  const model = parseGlyphPrototypeModel(untrustedModel);
  return {
    async recognize(strokes, options) {
      options.signal.throwIfAborted();
      const result = rankGlyphPrototype(model, strokes, options.scriptHint);
      options.signal.throwIfAborted();
      return result;
    },
  };
}
