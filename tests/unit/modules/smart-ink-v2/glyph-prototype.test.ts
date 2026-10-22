import { describe, expect, it } from "vitest";
import {
  createGlyphPrototypeProvider,
  extractGlyphPrototypeFeatures,
  parseGlyphPrototypeModel,
  rankGlyphPrototype,
  smartInkGlyphPrototypeFeatureCount,
  trainGlyphPrototypeModel,
} from "../../../../src/modules/smart-ink/v2/glyph-prototype";

const stroke = (points: readonly { x: number; y: number }[]) => ({ points });
const horizontal = [stroke([{ x: 0, y: 0 }, { x: 100, y: 0 }])];
const vertical = [stroke([{ x: 50, y: 0 }, { x: 50, y: 100 }])];
const dot = [stroke([{ x: 2, y: 3 }])];
const examples = [
  { script: "Latn", character: "I", strokes: vertical },
  { script: "Latn", character: "I", strokes: [stroke([{ x: 10, y: 20 }, { x: 10, y: 80 }])] },
  { script: "Grek", character: "Ι", strokes: vertical },
  { script: "Cyrl", character: "Г", strokes: [stroke([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 40, y: 100 }])] },
  { script: "Zyyy", character: "1", strokes: [stroke([{ x: 5, y: 0 }, { x: 0, y: 12 }, { x: 0, y: 70 }])] },
] as const;

describe("Smart Ink glyph prototype baseline", () => {
  it("normalizes translation and scale, preserving aspect and stroke count", () => {
    const a = extractGlyphPrototypeFeatures(horizontal);
    const b = extractGlyphPrototypeFeatures([stroke([{ x: 200, y: 300 }, { x: 500, y: 300 }])]);
    expect(a).toHaveLength(smartInkGlyphPrototypeFeatureCount);
    expect(b).toEqual(a);
    expect(extractGlyphPrototypeFeatures(dot)).toHaveLength(smartInkGlyphPrototypeFeatureCount);
    expect(extractGlyphPrototypeFeatures([stroke([{ x: 0, y: 0 }]), stroke([{ x: 10, y: 0 }])])).not.toEqual(a);
  });

  it("learns deterministic prototypes and ranks exact script candidates", () => {
    const model = trainGlyphPrototypeModel(examples);
    expect(model.calibrated).toBe(false);
    expect(model.classes.map(({ script, character }) => script + ":" + character)).toEqual([
      "Cyrl:Г", "Grek:Ι", "Latn:I", "Zyyy:1",
    ]);
    expect(parseGlyphPrototypeModel(JSON.parse(JSON.stringify(model)))).toEqual(model);
    const first = rankGlyphPrototype(model, vertical, "Latn");
    expect(first.status).toBe("uncalibrated");
    expect(first.candidates).toHaveLength(1);
    expect(first.candidates[0]).toMatchObject({ script: "Latn", character: "I", distance: 0 });
    expect(rankGlyphPrototype(model, vertical, "Grek").candidates[0]?.character).toBe("Ι");
    expect(rankGlyphPrototype(model, vertical, "Cyrl").candidates[0]?.character).toBe("Г");
    expect(rankGlyphPrototype(model, vertical, "auto").candidates).toHaveLength(3);
  });

  it("never fabricates probability for ambiguous and negative strokes", () => {
    const result = rankGlyphPrototype(trainGlyphPrototypeModel(examples), horizontal);
    expect(result.status).toBe("uncalibrated");
    expect(result.candidates.every((item) => "probability" in item === false)).toBe(true);
  });

  it("rejects invalid training input and pathologically large traces", () => {
    expect(() => extractGlyphPrototypeFeatures([])).toThrow("stroke count");
    expect(() => extractGlyphPrototypeFeatures([stroke([{ x: Infinity, y: 3 }])])).toThrow("coordinates");
    expect(() => extractGlyphPrototypeFeatures([stroke(Array.from({ length: 4_097 }, () => ({ x: 0, y: 0 })))]))
      .toThrow("stroke size");
    expect(() => trainGlyphPrototypeModel([{ script: "Cyrl", character: "a", strokes: horizontal }, ...examples]))
      .toThrow("Unsupported");
    expect(() => trainGlyphPrototypeModel([
      { script: "Grek", character: "π", strokes: vertical },
      { script: "Grek", character: "π", strokes: horizontal },
    ])).toThrow("two glyph classes");
  });

  it("strictly validates an external model, including features and duplicate classes", () => {
    const model = trainGlyphPrototypeModel(examples);
    expect(() => parseGlyphPrototypeModel({ ...model, calibrated: true })).toThrow("artifact");
    expect(() => parseGlyphPrototypeModel({
      ...model, classes: [...model.classes, model.classes[0]],
    })).toThrow("duplicate");
    expect(() => parseGlyphPrototypeModel({
      ...model, classes: [{ ...model.classes[0], features: [NaN] }, ...model.classes.slice(1)],
    })).toThrow("features");
    expect(() => parseGlyphPrototypeModel({ ...model, secret: "forbidden" })).toThrow("artifact");
  });

  it("honors cancellation and exposes only uncalibrated output", async () => {
    const model = trainGlyphPrototypeModel(examples);
    const provider = createGlyphPrototypeProvider(JSON.parse(JSON.stringify(model)));
    const controller = new AbortController();
    const response = await provider.recognize(horizontal, { signal: controller.signal });
    expect(response.status).toBe("uncalibrated");
    expect(response.candidates.length).toBeLessThanOrEqual(3);
    controller.abort();
    await expect(provider.recognize(horizontal, { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
