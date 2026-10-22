import { link, readFile, stat, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createServer } from "vite";
import { parseSmartInkGlyphCorpus } from "../tools/smart-ink-glyph-corpus.mjs";

const maximumInputBytes = 8_000_000;
const options = [
  "--train",
  "--calibration",
  "--holdout",
  "--model",
  "--report",
];

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      !options.includes(key) ||
      !value ||
      value.startsWith("--") ||
      Object.hasOwn(parsed, key)
    ) {
      throw new Error(
        "Usage: --train FILE --calibration FILE --holdout FILE --model OUTPUT --report OUTPUT",
      );
    }
    parsed[key] = value;
  }
  if (options.some((key) => !Object.hasOwn(parsed, key))) {
    throw new Error(
      "Provide all five train/calibration/holdout/model/report paths.",
    );
  }
  return parsed;
}

async function readCorpus(filename) {
  const metadata = await stat(filename);
  if (!metadata.isFile() || metadata.size > maximumInputBytes) {
    throw new TypeError("Glyph corpus exceeds input budget.");
  }
  return parseSmartInkGlyphCorpus(JSON.parse(await readFile(filename, "utf8")));
}

function assertIndependent(...corpora) {
  const samples = corpora.map((corpus) => corpus.samples);
  if (samples.some((group) => group.length === 0)) {
    throw new TypeError("Each corpus partition must be nonempty.");
  }
  const owners = new Map();
  const devices = new Map();
  const ids = new Set();
  samples.forEach((group, partition) =>
    group.forEach((sample) => {
      if (sample.labelStatus !== "reviewed") {
        throw new TypeError(
          "Model training requires independently reviewed labels.",
        );
      }
      if (ids.has(sample.id))
        throw new TypeError("Duplicate sample across corpus partitions.");
      ids.add(sample.id);
      for (const [map, key] of [
        [owners, sample.writerId],
        [devices, sample.deviceId],
      ]) {
        const previous = map.get(key);
        if (previous !== undefined && previous !== partition) {
          throw new TypeError(
            "Writer/device leakage across corpus partitions.",
          );
        }
        map.set(key, partition);
      }
    }),
  );
}

function evaluate(model, corpus, recognizer) {
  const confusion = {};
  const perScript = Object.fromEntries(
    ["Cyrl", "Latn", "Grek", "Zyyy"].map((script) => [
      script,
      { count: 0, top1: 0, top3: 0 },
    ]),
  );
  let glyphs = 0;
  let top1 = 0;
  let top3 = 0;
  let negatives = 0;
  const negativeDistances = [];
  for (const sample of corpus.samples) {
    const ranked = recognizer.rankGlyphPrototype(
      model,
      sample.strokes,
    ).candidates;
    const predicted = ranked[0]
      ? ranked[0].script + ":" + ranked[0].character
      : "none";
    const truth =
      sample.target.kind === "glyph"
        ? sample.target.script + ":" + sample.target.character
        : sample.target.kind === "shape"
          ? "shape:" + sample.target.shape
          : "ordinary-ink";
    confusion[truth] ??= {};
    confusion[truth][predicted] = (confusion[truth][predicted] ?? 0) + 1;
    if (sample.target.kind === "glyph") {
      glyphs += 1;
      perScript[sample.target.script].count += 1;
      const exact =
        ranked[0]?.script === sample.target.script &&
        ranked[0]?.character === sample.target.character;
      const withinThree = ranked.some(
        (row) =>
          row.script === sample.target.script &&
          row.character === sample.target.character,
      );
      if (exact) {
        top1 += 1;
        perScript[sample.target.script].top1 += 1;
      }
      if (withinThree) {
        top3 += 1;
        perScript[sample.target.script].top3 += 1;
      }
    } else {
      negatives += 1;
      if (ranked[0]) negativeDistances.push(ranked[0].distance);
    }
  }
  negativeDistances.sort((a, b) => a - b);
  return {
    status: "experimental-uncalibrated",
    total: corpus.samples.length,
    glyphs,
    negatives,
    top1Accuracy: glyphs ? top1 / glyphs : null,
    top3Accuracy: glyphs ? top3 / glyphs : null,
    perScript,
    confusion,
    negativeNearestDistanceMedian: negativeDistances.length
      ? negativeDistances[Math.floor(negativeDistances.length / 2)]
      : null,
    // No accepted/false-positive rates until calibrated open-set thresholds.
    falseAcceptanceRate: null,
  };
}

async function main(args) {
  const argv = parseArgs(args);
  const [train, calibration, holdout] = await Promise.all([
    readCorpus(argv["--train"]),
    readCorpus(argv["--calibration"]),
    readCorpus(argv["--holdout"]),
  ]);
  assertIndependent(train, calibration, holdout);
  const vite = await createServer({
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  });
  let artifact;
  let report;
  try {
    const recognizer = await vite.ssrLoadModule(
      "/src/modules/smart-ink/v2/glyph-prototype.ts",
    );
    const trainGlyphs = train.samples.filter(
      (sample) => sample.target.kind === "glyph",
    );
    artifact = recognizer.trainGlyphPrototypeModel(
      trainGlyphs.map((sample) => ({
        script: sample.target.script,
        character: sample.target.character,
        strokes: sample.strokes,
      })),
    );
    report = {
      schemaVersion: "tutorboard.smart-ink-glyph-experiment-report/1",
      modelVersion: artifact.schemaVersion,
      calibrated: false,
      trainedClasses: artifact.classes.length,
      trainingSamples: trainGlyphs.length,
      trainingNegativesExcluded: train.samples.length - trainGlyphs.length,
      calibration: evaluate(artifact, calibration, recognizer),
      holdout: evaluate(artifact, holdout, recognizer),
    };
  } finally {
    await vite.close();
  }
  const modelPath = resolve(argv["--model"]);
  const reportPath = resolve(argv["--report"]);
  if (modelPath === reportPath)
    throw new TypeError("Model and report paths must differ.");
  // Stage in each target directory. Hard links publish without overwriting
  // existing files; rollback removes only files created by this invocation.
  const outputs = [
    { path: modelPath, value: artifact },
    { path: reportPath, value: report },
  ];
  const staged = [];
  const published = [];
  try {
    for (const output of outputs) {
      const temp = output.path + "." + randomUUID() + ".tmp";
      staged.push(temp);
      await writeFile(temp, JSON.stringify(output.value, null, 2) + "\n", {
        flag: "wx",
      });
    }
    for (let index = 0; index < outputs.length; index += 1) {
      await link(staged[index], outputs[index].path);
      published.push(outputs[index].path);
    }
  } catch (error) {
    await Promise.all(published.map((path) => unlink(path)));
    throw error;
  } finally {
    await Promise.all(
      staged.map((path) =>
        unlink(path).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        }),
      ),
    );
  }
  process.stdout.write(
    JSON.stringify(
      {
        trainingSamples: report.trainingSamples,
        trainedClasses: report.trainedClasses,
        calibrated: false,
        calibration: {
          glyphs: report.calibration.glyphs,
          top1Accuracy: report.calibration.top1Accuracy,
        },
        holdout: {
          glyphs: report.holdout.glyphs,
          top1Accuracy: report.holdout.top1Accuracy,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      (error instanceof Error ? error.message : String(error)) + "\n",
    );
    process.exitCode = 1;
  });
}
