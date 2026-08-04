import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replace(path, before, after) {
  const source = read(path);
  if (!source.includes(before)) {
    throw new Error(`Expected fragment missing in ${path}: ${before}`);
  }
  write(path, source.replace(before, after));
}

function replaceAll(path, before, after) {
  const source = read(path);
  if (!source.includes(before)) {
    throw new Error(`Expected token missing in ${path}: ${before}`);
  }
  write(path, source.split(before).join(after));
}

function replacePattern(path, pattern, replacement) {
  const source = read(path);
  const corrected = source.replace(pattern, replacement);
  if (corrected === source) {
    throw new Error(`Expected pattern missing in ${path}: ${String(pattern)}`);
  }
  write(path, corrected);
}

replaceAll(
  "src/adapters/board-http/client.ts",
  'z.literal("1.1")',
  'z.literal("1.2")',
);

replace(
  "src/adapters/canvas-konva/BoardStage.tsx",
  "interface TimedWorldPointerSample extends WorldPointerSample, WetInkSample {}",
  'type TimedWorldPointerSample = Omit<\n  WorldPointerSample,\n  "inputTimestampMs"\n> &\n  WetInkSample;',
);

replacePattern(
  "src/app/App.tsx",
  /^(\s*)inputTimestampMs: sample\.inputTimestampMs,$/gmu,
  (_match, indent) =>
    `${indent}...(sample.inputTimestampMs === undefined\n${indent}  ? {}\n${indent}  : { inputTimestampMs: sample.inputTimestampMs }),`,
);

replace(
  "tests/integration/coordinate-plot-sync.test.ts",
  '          expectedDocumentSha256.length === 64 && schemaVersion === "1.1",',
  '          expectedDocumentSha256.length === 64 && schemaVersion === "1.2",',
);

replace(
  "src/app/handwritten-function-composition.ts",
  `    const retained = new Set(points);\n    const samples = stroke.points\n      .filter((point) => retained.has(point))\n      .map((point) => ({\n        point: { x: point.x, y: point.y },\n        pressure: 0.5,\n        timestampMs: Math.max(0, point.timeMs - stroke.points[0]!.timeMs),\n      }));`,
  `    let sourceIndex = 0;\n    const firstTimestampMs = stroke.points[0]!.timeMs;\n    const samples = points.map((point) => {\n      let matchIndex = sourceIndex;\n      while (\n        matchIndex < stroke.points.length &&\n        (stroke.points[matchIndex]!.x !== point.x ||\n          stroke.points[matchIndex]!.y !== point.y)\n      ) {\n        matchIndex += 1;\n      }\n      const boundedIndex = Math.min(matchIndex, stroke.points.length - 1);\n      const sourcePoint = stroke.points[boundedIndex]!;\n      sourceIndex = Math.min(stroke.points.length, boundedIndex + 1);\n      return {\n        point: { ...point },\n        pressure: 0.5,\n        timestampMs: Math.max(0, sourcePoint.timeMs - firstTimestampMs),\n      };\n    });`,
);

for (const path of [
  "tests/unit/adapters/canvas-konva/wet-ink-renderer.test.ts",
  "tests/performance/wet-ink-renderer.test.ts",
]) {
  const source = read(path);
  const inlinePattern =
    /\{ inputTimestampMs: ([^,\n]+), point: \{ x: ([^,\n]+), y: ([^}\n]+) \} \}/gu;
  const corrected = source.replace(
    inlinePattern,
    "{ inputTimestampMs: $1, point: { x: $2, y: $3 }, pressure: 0.5 }",
  );
  if (corrected === source) {
    throw new Error(`No inline wet ink samples were corrected in ${path}.`);
  }
  write(path, corrected);
}

replace(
  "tests/performance/wet-ink-renderer.test.ts",
  "        point: { x: frame * 100 + index, y: Math.sin(index / 8) * 20 },\n      }));",
  "        point: { x: frame * 100 + index, y: Math.sin(index / 8) * 20 },\n        pressure: 0.5,\n      }));",
);
