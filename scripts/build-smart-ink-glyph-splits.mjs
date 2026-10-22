import { link, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseSmartInkGlyphCorpus,
  splitSmartInkGlyphCorpus,
  summarizeSmartInkGlyphCorpus,
} from "../tools/smart-ink-glyph-corpus.mjs";

const maximumFileBytes = 8_000_000;
const commands = new Set(["--input", "--out-prefix"]);

function argumentsForRun(args) {
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!commands.has(args[i]) || !args[i + 1] ||
        args[i + 1].startsWith("--") || opts[args[i]] !== undefined) {
      throw new Error("Usage: --input <corpus.json> [--out-prefix <path>]");
    }
    opts[args[i]] = args[i + 1];
  }
  if (!opts["--input"]) {
    throw new Error("Provide a corpus via --input.");
  }
  return opts;
}

async function readCorpus(input) {
  const meta = await stat(input);
  if (!meta.isFile() || meta.size > maximumFileBytes) {
    throw new Error("Glyph corpus file is too large.");
  }
  return parseSmartInkGlyphCorpus(JSON.parse(await readFile(input, "utf8")));
}

async function main(args) {
  const opts = argumentsForRun(args);
  const corpus = await readCorpus(opts["--input"]);
  if (!opts["--out-prefix"]) {
    process.stdout.write(JSON.stringify(summarizeSmartInkGlyphCorpus(corpus), null, 2) + "\n");
    return;
  }
  const split = splitSmartInkGlyphCorpus(corpus);
  const prefix = resolve(opts["--out-prefix"]);
  const output = ["train", "calibration", "holdout"].map((name) => ({
    file: prefix + "." + name + ".json",
    payload: split[name],
  }));
  // Staging is in the output directory; hard-link creation is exclusive.
  // If any write or publish fails, roll back every output created by this run.
  const staged = [];
  const published = [];
  try {
    for (const item of output) {
      const temp = item.file + "." + randomUUID() + ".tmp";
      await writeFile(temp, JSON.stringify(item.payload, null, 2) + "\n", {
        encoding: "utf8", flag: "wx",
      });
      staged.push({ temp, final: item.file });
    }
    for (const item of staged) {
      await link(item.temp, item.final);
      published.push(item.final);
    }
  } catch (error) {
    await Promise.all(published.map((path) => unlink(path)));
    throw error;
  } finally {
    await Promise.all(staged.map(({ temp }) =>
      unlink(temp).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      }),
    ));
  }
  process.stdout.write(JSON.stringify(split.summary, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(String(error.message ?? error) + "\n");
    process.exitCode = 1;
  });
}
