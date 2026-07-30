import { readFile, stat, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import { createServer } from "vite";

const maximumInputBytes = 25_000_000;

function valueAfter(arguments_, index, option) {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function boundedNumber(value, option, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${option} must be in [${minimum}, ${maximum}].`);
  }
  return parsed;
}

function parseArguments(arguments_) {
  let ambiguityMargin;
  let input;
  let minimumConfidence;
  let output;
  let requirePass = false;
  let sampleCount = 96;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--input" || argument === "--output") {
      const value = valueAfter(arguments_, index, argument);
      if (argument === "--input") input = value;
      else output = value;
      index += 1;
      continue;
    }
    if (argument === "--minimum-confidence") {
      minimumConfidence = boundedNumber(
        valueAfter(arguments_, index, argument),
        argument,
        0,
        1,
      );
      index += 1;
      continue;
    }
    if (argument === "--ambiguity-margin") {
      ambiguityMargin = boundedNumber(
        valueAfter(arguments_, index, argument),
        argument,
        0,
        1,
      );
      index += 1;
      continue;
    }
    if (argument === "--sample-count") {
      sampleCount = boundedNumber(
        valueAfter(arguments_, index, argument),
        argument,
        8,
        512,
      );
      if (!Number.isInteger(sampleCount)) {
        throw new Error("--sample-count must be an integer.");
      }
      index += 1;
      continue;
    }
    if (argument === "--require-pass") {
      requirePass = true;
      continue;
    }
    throw new Error(`Unknown option: ${argument}.`);
  }
  if (
    input === undefined ||
    output === undefined ||
    minimumConfidence === undefined ||
    ambiguityMargin === undefined
  ) {
    throw new Error(
      "--input, --output, --minimum-confidence and --ambiguity-margin are required.",
    );
  }
  return {
    ambiguityMargin,
    input,
    minimumConfidence,
    output,
    requirePass,
    sampleCount,
  };
}

async function readJson(path) {
  const information = await stat(path);
  if (!information.isFile() || information.size > maximumInputBytes) {
    throw new Error(`Holdout input is too large or invalid: ${path}`);
  }
  const bytes = await readFile(path);
  const content = path.endsWith(".gz")
    ? gunzipSync(bytes, { maxOutputLength: maximumInputBytes }).toString("utf8")
    : bytes.toString("utf8");
  return JSON.parse(content);
}

async function main(arguments_) {
  const configuration = parseArguments(arguments_);
  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  });
  try {
    const smartInk = await vite.ssrLoadModule(
      "/src/modules/smart-ink-spike/public.ts",
    );
    const corpus = smartInk.parseSmartInkCorpus(
      await readJson(configuration.input),
    );
    const options = {
      ambiguityMargin: configuration.ambiguityMargin,
      minimumConfidence: configuration.minimumConfidence,
      sampleCount: configuration.sampleCount,
    };
    const assessment = smartInk.assessSmartInkCalibrationGate(corpus, options);
    const report = {
      eligible: assessment.eligible,
      failures: assessment.failures,
      metrics: assessment.metrics,
      options,
      passed: assessment.passed,
      recognizerVersion: smartInk.smartInkRecognizerVersion,
      schemaVersion: "tutorboard.smart-ink-holdout-evaluation/0.1",
    };
    await writeFile(
      configuration.output,
      `${JSON.stringify(report, undefined, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    process.stdout.write(
      `precision=${assessment.metrics.macroPrecision}\n` +
        `FPR=${assessment.metrics.falsePositiveRate}\n` +
        `top2=${assessment.metrics.specializedTop2Accuracy}\n` +
        `unrecognized=${assessment.metrics.unrecognizedRate}\n` +
        `result=${assessment.passed ? "PASS" : "NOT PASSED"}\n`,
    );
    if (configuration.requirePass && !assessment.passed) {
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
