import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { PNG } from "pngjs";

import { extractHdsDominantContour } from "./lib/hds-contour.mjs";

const schemaVersion = "tutorboard.smart-ink-corpus/0.1";
const sourceKinds = new Set(["ellipse", "other", "rectangle", "triangle"]);
const maximumFiles = 100_000;
const maximumImageBytes = 1_000_000;
const maximumVertexBytes = 16_384;
const maximumSamples = 1_000;

function usage() {
  return [
    "Import HDS PNG drawings as reconstructed Smart Ink contours.",
    "",
    "Usage:",
    "  node scripts/import-hds-corpus.mjs \\",
    "    --root /path/hand-drawn-shapes-dataset/data \\",
    "    --max-per-kind 80 --seed 90210 --output /path/hds.json",
    "",
    "The adapter hashes participant and file identities, validates companion",
    "vertex CSV files, and records traceOrigin=raster-contour.",
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
  let maxPerKind = 80;
  let output;
  let root;
  let seed = 9_021;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true, maxPerKind, output, root, seed };
    }
    if (argument === "--root") {
      root = readOptionValue(arguments_, index, "--root");
      index += 1;
      continue;
    }
    if (argument === "--max-per-kind") {
      maxPerKind = parsePositiveInteger(
        readOptionValue(arguments_, index, "--max-per-kind"),
        "--max-per-kind",
        Math.floor(maximumSamples / sourceKinds.size),
      );
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
    if (argument === "--output") {
      output = readOptionValue(arguments_, index, "--output");
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}.`);
  }
  if (root === undefined || output === undefined) {
    throw new Error("--root and --output are required.");
  }
  return { help: false, maxPerKind, output, root, seed };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function normalizedRelative(root, path) {
  return relative(root, path).split(sep).join("/");
}

async function walkFiles(root) {
  const information = await stat(root);
  if (!information.isDirectory()) {
    throw new Error("HDS root must be a directory.");
  }
  const files = [];
  const directories = [root];
  while (directories.length > 0) {
    const current = directories.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        directories.push(path);
      } else if (entry.isFile()) {
        files.push(path);
        if (files.length > maximumFiles) {
          throw new Error(`HDS root exceeds ${maximumFiles} files.`);
        }
      }
    }
  }
  return files;
}

function classifyPath(root, path) {
  if (extname(path).toLowerCase() !== ".png") {
    return undefined;
  }
  const parts = normalizedRelative(root, path).split("/");
  if (
    parts.length !== 4 ||
    parts[1] !== "images" ||
    !sourceKinds.has(parts[2])
  ) {
    return undefined;
  }
  return {
    participant: parts[0],
    path,
    relativePath: parts.join("/"),
    sourceKind: parts[2],
  };
}

function expectedKind(sourceKind) {
  return sourceKind === "other" ? "negative" : sourceKind;
}

function acceptableKinds(kind) {
  if (kind === "ellipse") {
    return ["ellipse", "circle"];
  }
  if (kind === "rectangle") {
    return ["rectangle", "square"];
  }
  return kind === "negative" ? [] : [kind];
}

async function validateVertices(root, candidate) {
  const vertexPath = join(
    root,
    candidate.participant,
    "vertices",
    candidate.sourceKind,
    `${basename(candidate.path, extname(candidate.path))}.csv`,
  );
  const information = await stat(vertexPath);
  if (!information.isFile() || information.size > maximumVertexBytes) {
    throw new Error("invalid companion vertex file");
  }
  const content = (await readFile(vertexPath, "utf8")).trim();
  const vertices =
    content.length === 0
      ? []
      : content.split(/\r?\n/).map((line) => {
          const values = line.split(",").map(Number);
          if (
            values.length !== 2 ||
            values.some(
              (value) => !Number.isFinite(value) || value < 0 || value > 1,
            )
          ) {
            throw new Error("invalid HDS vertex coordinate");
          }
          return values;
        });
  const expectedVertexCount =
    candidate.sourceKind === "triangle"
      ? 3
      : candidate.sourceKind === "other"
        ? undefined
        : 4;
  if (
    (expectedVertexCount !== undefined &&
      vertices.length !== expectedVertexCount) ||
    vertices.length > 32
  ) {
    throw new Error("unexpected HDS vertex count");
  }
}

async function importCandidate(root, candidate) {
  await validateVertices(root, candidate);
  const information = await stat(candidate.path);
  if (!information.isFile() || information.size > maximumImageBytes) {
    throw new Error("HDS image exceeds the safe size limit");
  }
  const decoded = PNG.sync.read(await readFile(candidate.path), {
    checkCRC: true,
  });
  const points = extractHdsDominantContour({
    data: decoded.data,
    height: decoded.height,
    width: decoded.width,
  });
  const kind = expectedKind(candidate.sourceKind);
  const sampleDigest = digest(`hds-file:${candidate.relativePath}`);
  const participantDigest = digest(`hds-participant:${candidate.participant}`);
  return {
    acceptableKinds: acceptableKinds(kind),
    expectedKind: kind,
    id: `hds-${kind}-${sampleDigest}`,
    metadata: {
      browser: "other",
      deviceProfile: "other-device",
      durationMs: 0,
      pointerType: "unknown",
      sourceDataset: "hds",
      sourceGroupId: `hds-group-${participantDigest}`,
      traceOrigin: "raster-contour",
    },
    points,
    provenance: "external-human",
    shouldPropose: kind !== "negative",
  };
}

function rankedCandidates(candidates, seed) {
  return [...candidates].sort((left, right) => {
    const leftRank = digest(`${seed}:${left.relativePath}`);
    const rightRank = digest(`${seed}:${right.relativePath}`);
    return (
      leftRank.localeCompare(rightRank) ||
      left.relativePath.localeCompare(right.relativePath)
    );
  });
}

export async function importHdsCorpus(configuration) {
  const candidates = (await walkFiles(configuration.root))
    .map((path) => classifyPath(configuration.root, path))
    .filter((candidate) => candidate !== undefined);
  const samples = [];
  const reports = [];
  for (const sourceKind of sourceKinds) {
    const selected = rankedCandidates(
      candidates.filter((candidate) => candidate.sourceKind === sourceKind),
      configuration.seed,
    );
    let rejectedCount = 0;
    let importedCount = 0;
    for (const candidate of selected) {
      if (importedCount >= configuration.maxPerKind) {
        break;
      }
      try {
        samples.push(await importCandidate(configuration.root, candidate));
        importedCount += 1;
      } catch {
        rejectedCount += 1;
      }
    }
    reports.push({
      candidateCount: selected.length,
      importedCount,
      rejectedCount,
      sourceKind,
    });
  }
  if (samples.length > maximumSamples) {
    throw new Error(`HDS corpus exceeds ${maximumSamples} samples.`);
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
  const result = await importHdsCorpus(configuration);
  await writeFile(
    configuration.output,
    `${JSON.stringify(result.corpus, undefined, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  for (const report of result.reports) {
    process.stdout.write(
      `${report.sourceKind}: imported ${report.importedCount}/${report.candidateCount}, rejected ${report.rejectedCount}\n`,
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
