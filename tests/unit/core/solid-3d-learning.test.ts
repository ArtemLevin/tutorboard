import { describe, expect, it } from "vitest";

import {
  actorId,
  applySolidLearningAction,
  buildSectionConstructionGraph,
  buildSolidProjectionViewModel,
  commandId,
  compareSolidSectionPrediction,
  createEmptyBoardDocument,
  createSolidLearningAttempt,
  createSolidTopology,
  deserializeBoardDocument,
  cyclesEquivalent,
  documentId,
  exactValuesEqual,
  groupId,
  intersectPolyhedronWithPlane,
  migrateBoardDocument13To14,
  parseExactValue,
  planeFromThreePoints,
  renderRussianProof,
  reduceBoardDocument,
  resolveSolidPointAnchor,
  solid3DId,
  solidLearningAttemptId,
  solidLearningScenarios,
  serializeBoardDocument,
  summarizeSolidLearningAttempt,
  validateConstructionAction,
  validateReasoningStep,
  validateSolidLearningScenario,
  type Solid3DDefinition,
  type Solid3DRecord,
} from "../../../src/core/public";
import {
  createCompleteSolidLearningCommand,
  createSolidLearningActionCommand,
  createStartSolidLearningCommand,
} from "../../../src/modules/solid-3d-learning/public";
import {
  createTextShapePlacementCommand,
  textShapeCatalog,
} from "../../../src/modules/text-shape-placement/public";

const timestamp = "2026-08-08T12:00:00.000Z";

function record(definition: Solid3DDefinition): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition,
    id: solid3DId("solid:learning-test"),
    points: [],
    projection: {
      hiddenEdgePolicy: "dashed",
      kind: "oblique",
      matrix: [1, 0, 0.42, 0, -1, -0.32],
      origin: { x: 0, y: 0 },
      viewportScale: 1,
    },
    rootGroupId: groupId("group:learning-test"),
    schemaVersion: "1.0",
    sections: [],
    source: { kind: "text-template", templateId: definition.kind },
  };
}

function cubeSection() {
  const topology = createSolidTopology({ edgeLength: 2, kind: "cube" })!;
  const plane = planeFromThreePoints(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  )!;
  return { topology, section: intersectPolyhedronWithPlane(topology, plane)! };
}

describe("solid 3D learning domain", () => {
  it("migrates BoardDocument 1.3 to 1.4 without changing solid models", () => {
    const current = createEmptyBoardDocument({
      createdAt: timestamp,
      id: documentId("document:learning-migration"),
      title: "Learning",
    });
    const { solidLearningAttempts: _attempts, ...legacy } = current;
    expect(_attempts).toEqual({});
    const migrated = migrateBoardDocument13To14({
      ...legacy,
      schemaVersion: "1.3",
    });
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.document.schemaVersion).toBe("1.4");
      expect(migrated.document.solidLearningAttempts).toEqual({});
    }
  });

  it("keeps attempt actions deterministic and bounded", () => {
    let attempt = createSolidLearningAttempt({
      actorId: actorId("actor:student"),
      id: solidLearningAttemptId("solid-learning:test"),
      mode: "guided",
      scenarioId: "cube-three-vertices",
      scenarioVersion: "1.0",
      solidId: solid3DId("solid:test"),
      timestamp,
    });
    attempt = applySolidLearningAction(
      attempt,
      { kind: "set-phase", phase: "prediction" },
      "2026-08-08T12:00:01.000Z",
    );
    attempt = applySolidLearningAction(
      attempt,
      {
        kind: "submit-prediction",
        prediction: {
          confidence: "confident",
          edgeIds: [],
          parallelSidePairs: [],
          polygonKind: "четырёхугольник",
          score: 1,
          submitted: true,
          vertexCount: 4,
        },
      },
      "2026-08-08T12:00:02.000Z",
    );
    expect(attempt.phase).toBe("construction");
    expect(attempt.revision).toBe(2);
    expect(summarizeSolidLearningAttempt(attempt)).toMatchObject({
      predictionScore: 1,
    });
  });

  it("builds stable linked projections and prediction comparison", () => {
    const { topology, section } = cubeSection();
    const first = buildSolidProjectionViewModel(topology, "isometric", section);
    const second = buildSolidProjectionViewModel(
      topology,
      "isometric",
      section,
    );
    expect(second).toEqual(first);
    expect(first.nodes).toHaveLength(8);
    const comparison = compareSolidSectionPrediction(
      {
        confidence: "confident",
        edgeIds: [],
        parallelSidePairs: [],
        polygonKind: "четырёхугольник",
        score: null,
        submitted: true,
        vertexCount: 4,
      },
      topology,
      section,
    );
    expect(comparison.correctVertexCount).toBe(4);
    expect(comparison.correctPolygonKind).toBe("quadrilateral");
    expect(comparison.score).toBeGreaterThan(0.6);
  });

  it("accepts both contour directions and diagnoses invalid actions", () => {
    const { topology, section } = cubeSection();
    const graph = buildSectionConstructionGraph(topology, section);
    expect(graph.segments).toHaveLength(4);
    expect(cyclesEquivalent(graph.cycle, [...graph.cycle].reverse())).toBe(
      true,
    );
    expect(
      validateConstructionAction(graph, {
        kind: "close-contour",
        orderedPointIds: [...graph.cycle].reverse(),
      }).accepted,
    ).toBe(true);
    expect(
      validateConstructionAction(graph, {
        edgeId: "edge:missing",
        kind: "add-derived-point",
        parameter: 2,
      }),
    ).toMatchObject({ accepted: false, diagnosticCode: "point-outside-edge" });
  });

  it.each([
    ["3/2", 1.5],
    ["6/4", 1.5],
    ["2√3", 2 * Math.sqrt(3)],
    ["-sqrt(4)", -2],
    ["4,25", 4.25],
  ])("parses exact answer %s", (raw, expected) => {
    const parsed = parseExactValue(raw);
    expect(parsed).not.toBeNull();
    expect(
      exactValuesEqual(parsed!, { kind: "decimal", value: expected }, 1e-8),
    ).toBe(true);
  });

  it("validates proof prerequisites and renders deterministic Russian prose", () => {
    const step = {
      accepted: true,
      premiseIds: ["seed:1", "seed:2"],
      ruleId: "same-face",
      statementId: "statement:1",
    } as const;
    expect(validateReasoningStep(step, new Set(step.premiseIds)).accepted).toBe(
      true,
    );
    expect(renderRussianProof([step])).toContain("одной грани");
  });

  it("ships ten valid, deterministic scenario definitions", () => {
    expect(solidLearningScenarios).toHaveLength(10);
    for (const scenario of solidLearningScenarios) {
      expect(validateSolidLearningScenario(scenario)).toEqual([]);
      if (scenario.seedAnchors.length < 3) continue;
      const definition =
        scenario.supportedSolidKinds[0] === "cube"
          ? ({ edgeLength: 2, kind: "cube" } as const)
          : scenario.supportedSolidKinds[0] === "cuboid"
            ? ({ kind: "cuboid", size: { x: 3, y: 2, z: 2 } } as const)
            : scenario.supportedSolidKinds[0] === "tetrahedron"
              ? ({ edgeLength: 2, kind: "tetrahedron" } as const)
              : scenario.supportedSolidKinds[0] === "prism"
                ? ({
                    base: [
                      { x: -1, y: -1 },
                      { x: 1, y: -1 },
                      { x: 0, y: 1 },
                    ],
                    height: 2,
                    kind: "prism",
                  } as const)
                : ({
                    apex: { x: 0, y: 2, z: 0 },
                    base: [
                      { x: -1, y: -1 },
                      { x: 1, y: -1 },
                      { x: 1, y: 1 },
                      { x: -1, y: 1 },
                    ],
                    kind: "pyramid",
                  } as const);
      const topology = createSolidTopology(definition)!;
      expect(
        scenario.seedAnchors
          .slice(0, 3)
          .every(
            (anchor) => resolveSolidPointAnchor(topology, anchor) !== null,
          ),
        scenario.id,
      ).toBe(true);
    }
  });

  it("creates valid semantic records for learning fixtures", () => {
    expect(record({ edgeLength: 2, kind: "cube" }).definition.kind).toBe(
      "cube",
    );
  });

  it("replays start, act, stale rejection, completion and persistence", () => {
    const empty = createEmptyBoardDocument({
      createdAt: timestamp,
      id: documentId("document:learning-commands"),
      title: "Commands",
    });
    const cube = textShapeCatalog.find(({ id }) => id === "cube")!;
    const placement = createTextShapePlacementCommand({
      autoLabelVertices: true,
      definition: cube,
      metadata: {
        actorId: actorId("actor:student"),
        id: commandId("command:place-cube"),
        timestamp,
      },
      placement: { x: 100, y: 100 },
      token: "learning-command-cube",
    });
    const placed = reduceBoardDocument(empty, placement);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const solid = Object.values(placed.document.solidModels)[0]!;
    const started = reduceBoardDocument(
      placed.document,
      createStartSolidLearningCommand({
        attemptId: solidLearningAttemptId("solid-learning:command-test"),
        metadata: {
          actorId: actorId("actor:student"),
          id: commandId("command:start-learning"),
          timestamp: "2026-08-08T12:00:01.000Z",
        },
        mode: "guided",
        scenarioId: "cube-three-vertices",
        scenarioVersion: "1.0",
        solidId: solid.id,
      }),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const attempt = Object.values(started.document.solidLearningAttempts)[0]!;
    const action = createSolidLearningActionCommand({
      action: { kind: "set-phase", phase: "prediction" },
      attempt,
      metadata: {
        actorId: actorId("actor:student"),
        id: commandId("command:learning-action"),
        timestamp: "2026-08-08T12:00:02.000Z",
      },
    });
    const acted = reduceBoardDocument(started.document, action);
    expect(acted.ok).toBe(true);
    if (!acted.ok) return;
    const stale = reduceBoardDocument(acted.document, {
      ...action,
      id: commandId("command:stale-learning-action"),
    });
    expect(stale).toMatchObject({
      error: { code: "command.stale-learning-attempt" },
      ok: false,
    });
    const current = Object.values(acted.document.solidLearningAttempts)[0]!;
    const completed = reduceBoardDocument(
      acted.document,
      createCompleteSolidLearningCommand({
        attempt: current,
        metadata: {
          actorId: actorId("actor:student"),
          id: commandId("command:complete-learning"),
          timestamp: "2026-08-08T12:00:03.000Z",
        },
      }),
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    const serialized = serializeBoardDocument(completed.document);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const restored = deserializeBoardDocument(serialized.json);
    expect(restored.status).toBe("ok");
    if (restored.status === "ok")
      expect(
        Object.values(restored.document.solidLearningAttempts)[0]?.phase,
      ).toBe("completed");
  });
});
