import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { proposeSmartInkReplacement } from "../../../../src/modules/smart-ink/public.ts";
import { parseSmartInkCorpus } from "../../../../src/modules/smart-ink-spike/public.ts";

function stroke(sample) {
  return {
    groupId: null,
    id: sample.id,
    kind: "drawing.pen-stroke",
    locked: false,
    points: sample.points,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#245d6b",
      strokeWidth: 3,
    },
    visible: true,
  };
}

describe("Smart Ink automatic canvas policy", () => {
  it("keeps captured Chrome negatives outside automatic correction", () => {
    const corpusPath = join(
      process.cwd(),
      "tests",
      "fixtures",
      "smart-ink-corpus",
      "captured-chromium-v1",
      "corpus.json.gz",
    );
    const corpus = parseSmartInkCorpus(
      JSON.parse(gunzipSync(readFileSync(corpusPath)).toString("utf8")),
    );
    const results = corpus.samples.map((sample) => ({
      result: proposeSmartInkReplacement(stroke(sample)),
      sample,
    }));
    const negativeProposals = results.filter(
      ({ result, sample }) =>
        sample.expectedKind === "negative" && result.status === "proposed",
    );
    const positiveProposals = results.filter(
      ({ result, sample }) =>
        sample.expectedKind !== "negative" && result.status === "proposed",
    );
    const circleProposals = results.filter(
      ({ result, sample }) =>
        sample.expectedKind === "circle" && result.status === "proposed",
    );
    const circlesNormalizedAsCircles = circleProposals.filter(
      ({ result }) => result.proposal.candidate.kind === "circle",
    );

    expect(negativeProposals).toHaveLength(0);
    expect(positiveProposals).toHaveLength(125);
    expect(circleProposals).toHaveLength(20);
    expect(circlesNormalizedAsCircles).toHaveLength(16);
  });
});
