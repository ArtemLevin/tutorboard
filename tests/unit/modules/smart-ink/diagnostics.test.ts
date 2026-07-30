import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  type PenStrokeObject,
} from "../../../../src/core/public";
import {
  proposeSmartInkReplacement,
  subscribeSmartInkDiagnostics,
  type SmartInkDiagnosticRecord,
} from "../../../../src/modules/smart-ink/public";

function lineStroke(): PenStrokeObject {
  return {
    groupId: null,
    id: boardObjectId("object:smart-ink-diagnostic"),
    kind: "drawing.pen-stroke",
    locked: false,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 1 },
      { x: 80, y: 0 },
    ],
    position: { x: 10, y: 20 },
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

describe("Smart Ink diagnostics", () => {
  it("publishes a reproducible record for every proposal evaluation", () => {
    const diagnostics: SmartInkDiagnosticRecord[] = [];
    const unsubscribe = subscribeSmartInkDiagnostics((record) => {
      diagnostics.push(record);
    });

    const result = proposeSmartInkReplacement(lineStroke());
    unsubscribe();
    const diagnostic = diagnostics[0];

    expect(result.status).toBe("proposed");
    expect(diagnostic).toMatchObject({
      outcome: "proposed",
      reason: "proposal-created",
      replacementKind: "drawing.line",
      schemaVersion: "tutorboard.smart-ink-diagnostic/0.1",
      selectedCandidateKind: "line",
      sourcePointCount: 3,
    });
    expect(diagnostic?.points).toEqual([
      { x: 10, y: 20 },
      { x: 50, y: 21 },
      { x: 90, y: 20 },
    ]);
    expect(diagnostic?.recognizer.sampledPointCount).toBe(96);
  });

  it("stops publishing after unsubscribe", () => {
    let publicationCount = 0;
    const unsubscribe = subscribeSmartInkDiagnostics(() => {
      publicationCount += 1;
    });
    unsubscribe();

    proposeSmartInkReplacement(lineStroke());

    expect(publicationCount).toBe(0);
  });
});
