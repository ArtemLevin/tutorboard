import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const schemaVersion = "tutorboard.smart-ink-corpus/0.1";
const supportedKinds = new Set([
  "circle",
  "ellipse",
  "line",
  "negative",
  "rectangle",
  "square",
  "triangle",
]);
const quickDrawPositiveKinds = new Set([
  "circle",
  "line",
  "square",
  "triangle",
]);
const quickDrawNegativeCategories = new Set(["squiggle", "star", "zigzag"]);
const officialDatasetBaseUrl =
  "https://storage.googleapis.com/quickdraw_dataset/full/raw";
const maximumInputs = 32;
const maximumFileBytes = 2_000_000_000;
const maximumLineBytes = 2_000_000;
const maximumPoints = 4_096;
const maximumSamples = 1_000;
const maximumDurationMs = 300_000;

function usage() {
  return [
    "Import raw Quick, Draw! NDJSON trajectories into a Smart Ink corpus.",
    "",
    "Usage:",
    "  node scripts/import-quickdraw-corpus.mjs \\",
    "    --input line=/path/line.ndjson \\",
    "    --input circle=/path/circle.ndjson \\",
    "    --input negative=/path/squiggle.ndjson \\",
    "    --max-per-input 40 --seed 90210 --output /path/corpus.json",
    "",
    "Or stream an attributed sample directly from the official dataset:",
    "  node scripts/import-quickdraw-corpus.mjs \\",
    "    --official line --official circle --official square \\",
    "    --official triangle --official negative=squiggle \\",
    "    --official negative=zigzag \\",
    "    --max-per-input 40 --seed 90210 --output /path/corpus.json",
    "",
    "Only one-stroke, recognized raw records with x/y/t arrays are retained.",
    "Quick, Draw! does not provide rectangle or ellipse categories.",
  ].join("\n");
}

function readOptionValue(arguments_, index, option) {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(value, option, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${option} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

function parseArguments(arguments_) {
  const inputs = [];
  let maxPerInput = 40;
  let output;
  let seed = 9_021;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true, inputs, maxPerInput, output, seed };
    }
    if (argument === "--input") {
      const specification = readOptionValue(arguments_, index, "--input");
      index += 1;
      const separator = specification.indexOf("=");
      if (separator <= 0 || separator === specification.length - 1) {
        throw new Error("--input must use kind=/absolute/or/relative/path.");
      }
      const kind = specification.slice(0, separator);
      const path = specification.slice(separator + 1);
      if (!supportedKinds.has(kind)) {
        throw new Error(`Unsupported Smart Ink target kind: ${kind}.`);
      }
      if (kind !== "negative" && !quickDrawPositiveKinds.has(kind)) {
        throw new Error(
          `Quick, Draw! has no direct ${kind} category; do not relabel derived geometry as human.`,
        );
      }
      inputs.push({ kind, path });
      continue;
    }
    if (argument === "--official") {
      const specification = readOptionValue(arguments_, index, "--official");
      index += 1;
      const separator = specification.indexOf("=");
      const kind =
        separator === -1 ? specification : specification.slice(0, separator);
      const category =
        separator === -1 ? specification : specification.slice(separator + 1);
      if (!supportedKinds.has(kind) || category.length === 0) {
        throw new Error(
          "--official must use a supported kind or negative=category.",
        );
      }
      if (
        (kind !== "negative" &&
          (!quickDrawPositiveKinds.has(kind) || category !== kind)) ||
        (kind === "negative" && !quickDrawNegativeCategories.has(category))
      ) {
        throw new Error(
          `Unsupported official Quick, Draw! mapping: ${kind}=${category}.`,
        );
      }
      inputs.push({ category, kind, sourceType: "official" });
      continue;
    }
    if (argument === "--max-per-input") {
      maxPerInput = parsePositiveInteger(
        readOptionValue(arguments_, index, "--max-per-input"),
        "--max-per-input",
        maximumSamples,
      );
      index += 1;
      continue;
    }
    if (argument === "--output") {
      output = readOptionValue(arguments_, index, "--output");
      index += 1;
      continue;
    }
    if (argument === "--seed") {
      seed = parsePositiveInteger(
        readOptionValue(arguments_, index, "--seed"),
        "--seed",
        0x7fffffff,
      );
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}.`);
  }

  if (inputs.length === 0) {
    throw new Error("At least one --input is required.");
  }
  if (inputs.length > maximumInputs) {
    throw new Error(`At most ${maximumInputs} inputs are allowed.`);
  }
  if (inputs.length * maxPerInput > maximumSamples) {
    throw new Error(
      `Requested corpus exceeds the ${maximumSamples}-sample schema limit.`,
    );
  }
  if (output === undefined) {
    throw new Error("--output is required.");
  }
  return { help: false, inputs, maxPerInput, output, seed };
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function acceptableKinds(kind) {
  if (kind === "circle") {
    return ["circle", "ellipse"];
  }
  if (kind === "square") {
    return ["square", "rectangle"];
  }
  return kind === "negative" ? [] : [kind];
}

function anonymizedDigest(kind, keyId) {
  return createHash("sha256")
    .update(`quickdraw:${kind}:${keyId}`)
    .digest("hex")
    .slice(0, 20);
}

function parseRawRecord(line, targetKind, expectedWord) {
  if (Buffer.byteLength(line, "utf8") > maximumLineBytes) {
    return undefined;
  }
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (
    record === null ||
    typeof record !== "object" ||
    record.recognized !== true ||
    typeof record.key_id !== "string" ||
    typeof record.word !== "string" ||
    !Array.isArray(record.drawing) ||
    record.drawing.length !== 1
  ) {
    return undefined;
  }
  if (
    (expectedWord !== undefined && record.word !== expectedWord) ||
    (expectedWord === undefined &&
      targetKind !== "negative" &&
      record.word !== targetKind)
  ) {
    return undefined;
  }
  const stroke = record.drawing[0];
  if (
    !Array.isArray(stroke) ||
    stroke.length < 3 ||
    !Array.isArray(stroke[0]) ||
    !Array.isArray(stroke[1]) ||
    !Array.isArray(stroke[2])
  ) {
    return undefined;
  }
  const [xCoordinates, yCoordinates, timestamps] = stroke;
  if (
    xCoordinates.length < 2 ||
    xCoordinates.length > maximumPoints ||
    yCoordinates.length !== xCoordinates.length ||
    timestamps.length !== xCoordinates.length
  ) {
    return undefined;
  }
  if (
    !xCoordinates.every(Number.isFinite) ||
    !yCoordinates.every(Number.isFinite) ||
    !timestamps.every(Number.isFinite)
  ) {
    return undefined;
  }
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index] < timestamps[index - 1]) {
      return undefined;
    }
  }
  const durationMs = timestamps.at(-1) - timestamps[0];
  if (
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > maximumDurationMs
  ) {
    return undefined;
  }

  const digest = anonymizedDigest(targetKind, record.key_id);
  return {
    acceptableKinds: acceptableKinds(targetKind),
    expectedKind: targetKind,
    id: `quickdraw-${targetKind}-${digest}`,
    metadata: {
      browser: "other",
      deviceProfile: "other-device",
      durationMs,
      pointerType: "unknown",
      sourceCategory: record.word,
      sourceDataset: "quickdraw",
      sourceGroupId: `quickdraw-group-${digest}`,
      traceOrigin: "recorded-trajectory",
    },
    points: xCoordinates.map((x, index) => ({
      x,
      y: yCoordinates[index],
    })),
    provenance: "external-human",
    shouldPropose: targetKind !== "negative",
  };
}

async function sampleInput(input, maximum, random) {
  let source;
  let sourceLabel;
  if (input.sourceType === "official") {
    const url = `${officialDatasetBaseUrl}/${encodeURIComponent(input.category)}.ndjson`;
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(45 * 60 * 1_000),
    });
    if (!response.ok || response.body === null) {
      throw new Error(
        `Official Quick, Draw! request failed (${response.status}) for ${input.category}.`,
      );
    }
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > maximumFileBytes) {
      throw new Error(
        `Official Quick, Draw! response exceeds ${maximumFileBytes} bytes.`,
      );
    }
    source = Readable.fromWeb(response.body);
    sourceLabel = `official:${input.category}`;
  } else {
    const information = await stat(input.path);
    if (!information.isFile() || information.size > maximumFileBytes) {
      throw new Error(
        `Quick, Draw! input must be a file no larger than ${maximumFileBytes} bytes: ${input.path}`,
      );
    }
    source = createReadStream(input.path, { encoding: "utf8" });
    sourceLabel = input.path;
  }
  const reservoir = [];
  let eligibleCount = 0;
  let consumedBytes = 0;
  const lines = createInterface({
    crlfDelay: Number.POSITIVE_INFINITY,
    input: source,
  });
  for await (const line of lines) {
    consumedBytes += Buffer.byteLength(line, "utf8") + 1;
    if (consumedBytes > maximumFileBytes) {
      throw new Error(
        `Quick, Draw! input exceeds ${maximumFileBytes} streamed bytes.`,
      );
    }
    const sample = parseRawRecord(line, input.kind, input.category);
    if (sample === undefined) {
      continue;
    }
    eligibleCount += 1;
    if (reservoir.length < maximum) {
      reservoir.push(sample);
      continue;
    }
    const replacement = Math.floor(random() * eligibleCount);
    if (replacement < maximum) {
      reservoir[replacement] = sample;
    }
  }
  return { eligibleCount, samples: reservoir, sourceLabel };
}

export async function importQuickDrawCorpus(configuration) {
  const random = createRandom(configuration.seed);
  const samples = [];
  const reports = [];
  for (const input of configuration.inputs) {
    const result = await sampleInput(input, configuration.maxPerInput, random);
    samples.push(...result.samples);
    reports.push({
      eligibleCount: result.eligibleCount,
      importedCount: result.samples.length,
      kind: input.kind,
      source: result.sourceLabel,
    });
  }
  const ids = new Set(samples.map(({ id }) => id));
  if (ids.size !== samples.length) {
    throw new Error("Quick, Draw! inputs produced duplicate corpus ids.");
  }
  return {
    corpus: { samples, schemaVersion },
    reports,
  };
}

async function main(arguments_) {
  const configuration = parseArguments(arguments_);
  if (configuration.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await importQuickDrawCorpus(configuration);
  await writeFile(
    configuration.output,
    `${JSON.stringify(result.corpus, undefined, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx",
    },
  );
  for (const report of result.reports) {
    process.stdout.write(
      `${report.kind}: imported ${report.importedCount}/${report.eligibleCount} eligible records from ${report.source}\n`,
    );
  }
  process.stdout.write(`Wrote ${result.corpus.samples.length} samples.\n`);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
