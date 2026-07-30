import { stat, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import { createServer } from "vite";

const maximumInputs = 16;
const maximumInputBytes = 25_000_000;

function usage() {
  return [
    "Calibrate Smart Ink confidence on a group-safe calibration split.",
    "",
    "Usage:",
    "  node scripts/calibrate-smart-ink-corpus.mjs \\",
    "    --input /path/quickdraw.json --input /path/hds.json \\",
    "    --seed 90210 --calibration-ratio 0.7 \\",
    "    --output /path/calibration-report.json [--require-pass]",
    "",
    "Only the calibration partition selects thresholds. The holdout partition",
    "is evaluated once after selection. Raw stroke points are not written to",
    "the report.",
  ].join("\n");
}

function readOptionValue(arguments_, index, option) {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function positiveInteger(value, option, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${option} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

function parseArguments(arguments_) {
  const inputs = [];
  let calibrationRatio = 0.7;
  let minimumNegatives;
  let minimumPerClass;
  let output;
  let requirePass = false;
  let seed = 90_210;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      return {
        calibrationRatio,
        help: true,
        inputs,
        minimumNegatives,
        minimumPerClass,
        output,
        requirePass,
        seed,
      };
    }
    if (argument === "--input") {
      inputs.push(readOptionValue(arguments_, index, "--input"));
      index += 1;
      continue;
    }
    if (argument === "--output") {
      output = readOptionValue(arguments_, index, "--output");
      index += 1;
      continue;
    }
    if (argument === "--seed") {
      seed = positiveInteger(
        readOptionValue(arguments_, index, "--seed"),
        "--seed",
        0x7fffffff,
      );
      index += 1;
      continue;
    }
    if (argument === "--calibration-ratio") {
      calibrationRatio = Number(
        readOptionValue(arguments_, index, "--calibration-ratio"),
      );
      index += 1;
      continue;
    }
    if (argument === "--minimum-per-class") {
      minimumPerClass = positiveInteger(
        readOptionValue(arguments_, index, "--minimum-per-class"),
        "--minimum-per-class",
        1_000,
      );
      index += 1;
      continue;
    }
    if (argument === "--minimum-negatives") {
      minimumNegatives = positiveInteger(
        readOptionValue(arguments_, index, "--minimum-negatives"),
        "--minimum-negatives",
        1_000,
      );
      index += 1;
      continue;
    }
    if (argument === "--require-pass") {
      requirePass = true;
      continue;
    }
    throw new Error(`Unknown option: ${argument}.`);
  }
  if (inputs.length === 0 || inputs.length > maximumInputs) {
    throw new Error(`Provide 1-${maximumInputs} --input corpus files.`);
  }
  if (output === undefined) {
    throw new Error("--output is required.");
  }
  return {
    calibrationRatio,
    help: false,
    inputs,
    minimumNegatives,
    minimumPerClass,
    output,
    requirePass,
    seed,
  };
}

async function readJson(path) {
  const information = await stat(path);
  if (!information.isFile() || information.size > maximumInputBytes) {
    throw new Error(
      `Calibration input must be a file no larger than ${maximumInputBytes} bytes: ${path}`,
    );
  }
  const bytes = await readFile(path);
  const content = path.endsWith(".gz")
    ? gunzipSync(bytes, { maxOutputLength: maximumInputBytes }).toString("utf8")
    : bytes.toString("utf8");
  if (Buffer.byteLength(content, "utf8") > maximumInputBytes) {
    throw new Error(
      `Calibration input expands beyond ${maximumInputBytes} bytes: ${path}`,
    );
  }
  return JSON.parse(content);
}

async function main(arguments_) {
  const configuration = parseArguments(arguments_);
  if (configuration.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  });
  try {
    const smartInk = await vite.ssrLoadModule(
      "/src/modules/smart-ink-spike/public.ts",
    );
    const corpora = await Promise.all(configuration.inputs.map(readJson));
    const samples = corpora.flatMap(
      (input) => smartInk.parseSmartInkCorpus(input).samples,
    );
    const merged = smartInk.parseSmartInkCorpus({
      samples,
      schemaVersion: smartInk.smartInkCorpusSchemaVersion,
    });
    const calibrationOptions = {
      calibrationRatio: configuration.calibrationRatio,
      seed: configuration.seed,
      ...(configuration.minimumPerClass === undefined
        ? {}
        : { minimumPerClass: configuration.minimumPerClass }),
      ...(configuration.minimumNegatives === undefined
        ? {}
        : { minimumNegatives: configuration.minimumNegatives }),
    };
    const report = smartInk.calibrateSmartInkRecognizer(
      merged,
      calibrationOptions,
    );
    await writeFile(
      configuration.output,
      `${JSON.stringify(report, undefined, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    process.stdout.write(
      [
        `Selected minimumConfidence=${report.selectedOptions.minimumConfidence}`,
        `ambiguityMargin=${report.selectedOptions.ambiguityMargin}`,
        `holdout macro precision=${report.holdoutMetrics.macroPrecision}`,
        `holdout FPR=${report.holdoutMetrics.falsePositiveRate}`,
        `result=${report.passed ? "PASS" : "NOT PASSED"}`,
        `Wrote ${configuration.output}`,
      ].join("\n") + "\n",
    );
    if (configuration.requirePass && !report.passed) {
      process.exitCode = 2;
    }
  } finally {
    await vite.close();
  }
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
