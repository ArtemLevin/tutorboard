import { readFile, stat, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import { createServer } from "vite";

const maximumInputs = 16;
const maximumInputBytes = 25_000_000;

function valueAfter(arguments_, index, option) {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function positiveInteger(value, option, maximum = 1_000) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${option} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

function parseArguments(arguments_) {
  const candidates = [];
  const development = [];
  let minimumNegatives = 120;
  let minimumPerClass = 40;
  let output;
  let seed = 170_731;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--development" || argument === "--candidate") {
      const destination =
        argument === "--development" ? development : candidates;
      destination.push(valueAfter(arguments_, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--minimum-negatives") {
      minimumNegatives = positiveInteger(
        valueAfter(arguments_, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === "--minimum-per-class") {
      minimumPerClass = positiveInteger(
        valueAfter(arguments_, index, argument),
        argument,
      );
      index += 1;
      continue;
    }
    if (argument === "--seed") {
      seed = positiveInteger(
        valueAfter(arguments_, index, argument),
        argument,
        0x7fffffff,
      );
      index += 1;
      continue;
    }
    if (argument === "--output") {
      output = valueAfter(arguments_, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}.`);
  }
  if (
    development.length === 0 ||
    development.length > maximumInputs ||
    candidates.length === 0 ||
    candidates.length > maximumInputs ||
    output === undefined
  ) {
    throw new Error(
      "Provide 1-16 --development files, 1-16 --candidate files and --output.",
    );
  }
  return {
    candidates,
    development,
    minimumNegatives,
    minimumPerClass,
    output,
    seed,
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
  if (Buffer.byteLength(content, "utf8") > maximumInputBytes) {
    throw new Error(`Holdout input expands beyond the size limit: ${path}`);
  }
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
    const merge = async (paths) => {
      const inputs = await Promise.all(paths.map(readJson));
      return smartInk.parseSmartInkCorpus({
        samples: inputs.flatMap(
          (input) => smartInk.parseSmartInkCorpus(input).samples,
        ),
        schemaVersion: smartInk.smartInkCorpusSchemaVersion,
      });
    };
    const result = smartInk.buildIndependentSmartInkHoldout(
      await merge(configuration.development),
      await merge(configuration.candidates),
      {
        minimumNegatives: configuration.minimumNegatives,
        minimumPerClass: configuration.minimumPerClass,
        seed: configuration.seed,
      },
    );
    await writeFile(
      configuration.output,
      `${JSON.stringify(result.corpus, undefined, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          excludedDevelopmentGroupCount: result.excludedDevelopmentGroupCount,
          excludedDevelopmentSampleCount: result.excludedDevelopmentSampleCount,
          selectedCounts: result.selectedCounts,
          selectedGroupCount: result.selectedGroupCount,
        },
        undefined,
        2,
      )}\nWrote ${configuration.output}\n`,
    );
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
