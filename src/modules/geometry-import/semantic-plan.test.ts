import { describe, expect, it } from "vitest";

import { geometryImportId, type JsonValue } from "../../core/public";

import {
  createGeometryImportSemanticPlan,
  geometryImportLimits,
} from "./public";

function triangleAltitudeGir(): JsonValue {
  return {
    schema_version: "0.2.0",
    scene_type: "2d",
    metadata: {},
    objects: [
      { id: "A", label: "A", type: "point" },
      { id: "B", label: "B", type: "point" },
      { id: "C", label: "C", type: "point" },
      { id: "H", label: "H", type: "point" },
      { id: "BC", points: ["B", "C"], type: "segment" },
      { id: "AH", points: ["A", "H"], type: "segment" },
      { id: "ABC", type: "triangle", vertices: ["A", "B", "C"] },
    ],
    constraints: [
      {
        id: "c_noncol_abc",
        points: ["A", "B", "C"],
        type: "non_collinear",
      },
      {
        foot: "H",
        from_point: "A",
        id: "c_altitude_a_bc",
        segment: "AH",
        to_object: "BC",
        type: "altitude",
      },
    ],
    construction_steps: [
      {
        action: "construct_triangle",
        constraints: ["c_noncol_abc"],
        id: "step_construct_triangle",
        objects: ["A", "B", "C", "BC", "ABC"],
      },
      {
        action: "construct_altitude",
        constraints: ["c_altitude_a_bc"],
        id: "step_construct_altitude",
        objects: ["H", "AH"],
      },
    ],
  };
}

function fullReferenceGir(): JsonValue {
  return {
    schema_version: "0.2.0",
    scene_type: "2d",
    objects: [
      { id: "A", type: "point" },
      { id: "B", type: "point" },
      { id: "C", type: "point" },
      { id: "H", type: "point" },
      { id: "M", type: "point" },
      { id: "AB", points: ["A", "B"], type: "segment" },
      { id: "BC", points: ["B", "C"], type: "segment" },
      { id: "AH", points: ["A", "H"], type: "segment" },
      { id: "l1", points: ["A", "B"], type: "line" },
      { id: "l2", points: ["B", "C"], type: "line" },
      { id: "r1", start: "A", through: "B", type: "ray" },
      { id: "circle1", center: "A", radius_point: "B", type: "circle" },
      { id: "circle2", center: "B", radius_point: "C", type: "circle" },
      { id: "triangle1", type: "triangle", vertices: ["A", "B", "C"] },
      { id: "angle1", points: ["A", "B", "C"], type: "angle" },
      { id: "labelA", target: "A", text: "A", type: "label" },
    ],
    constraints: [
      { id: "belongs", object: "AB", point: "A", type: "belongs_to" },
      { id: "collinear", points: ["A", "B"], type: "collinear" },
      { id: "noncollinear", points: ["A", "B", "C"], type: "non_collinear" },
      { id: "parallel", objects: ["l1", "l2"], type: "parallel" },
      { id: "perpendicular", objects: ["l1", "l2"], type: "perpendicular" },
      { id: "equal", objects: ["AB", "BC"], type: "equal_length" },
      { id: "midpoint", object: "AB", point: "M", type: "midpoint" },
      {
        id: "intersection",
        objects: ["l1", "l2"],
        point: "H",
        type: "intersection",
      },
      {
        foot: "H",
        from_point: "A",
        id: "altitude",
        segment: "AH",
        to_object: "BC",
        type: "altitude",
      },
      {
        from_point: "A",
        id: "median",
        midpoint: "M",
        segment: "AH",
        to_object: "BC",
        type: "median",
      },
      { angle: "angle1", id: "bisector", ray: "r1", type: "angle_bisector" },
      {
        circle: "circle1",
        id: "circumcircle",
        triangle: "triangle1",
        type: "circumcircle",
      },
      {
        circle: "circle2",
        id: "incircle",
        triangle: "triangle1",
        type: "incircle",
      },
    ],
    construction_steps: [
      {
        action: "construct",
        constraints: [
          "belongs",
          "collinear",
          "noncollinear",
          "parallel",
          "perpendicular",
          "equal",
          "midpoint",
          "intersection",
          "altitude",
          "median",
          "bisector",
          "circumcircle",
          "incircle",
        ],
        id: "step",
        objects: [
          "A",
          "B",
          "C",
          "H",
          "M",
          "AB",
          "BC",
          "AH",
          "l1",
          "l2",
          "r1",
          "circle1",
          "circle2",
          "triangle1",
          "angle1",
          "labelA",
        ],
      },
    ],
  };
}

function plan(gir: JsonValue, id = "import-1") {
  return createGeometryImportSemanticPlan({
    canonicalGir: gir,
    importId: geometryImportId(id),
  });
}

describe("createGeometryImportSemanticPlan", () => {
  it("creates the triangle-altitude semantic plan without coordinates", () => {
    const result = plan(triangleAltitudeGir());

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(
      result.plan.candidates.filter((item) => item.kind === "point"),
    ).toHaveLength(4);
    expect(
      result.plan.candidates.filter((item) => item.kind === "segment"),
    ).toHaveLength(4);
    expect(
      result.plan.candidates.filter((item) => item.kind === "label"),
    ).toHaveLength(4);
    expect(result.plan.mapping.A).toHaveLength(2);
    expect(result.plan.mapping.BC).toHaveLength(1);
    expect(result.plan.mapping.ABC).toHaveLength(3);
    expect(JSON.stringify(result.plan)).not.toContain("position");
    expect(JSON.stringify(result.plan)).not.toContain("viewport");
  });

  it("is deterministic across repeated calls and source ordering", () => {
    const original = triangleAltitudeGir() as {
      objects: JsonValue[];
      constraints: JsonValue[];
      construction_steps: JsonValue[];
      [key: string]: JsonValue;
    };
    const permuted: JsonValue = {
      ...original,
      objects: [...original.objects].reverse(),
      constraints: [...original.constraints].reverse(),
      construction_steps: [...original.construction_steps].reverse(),
    };

    expect(plan(original)).toEqual(plan(permuted));
    expect(plan(original)).toEqual(plan(original));
  });

  it("namespaces every board identity by import ID", () => {
    const first = plan(triangleAltitudeGir(), "import-1");
    const second = plan(triangleAltitudeGir(), "import-2");
    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    if (first.status !== "success" || second.status !== "success") return;

    const firstIds = new Set(
      first.plan.candidates.map((item) => item.boardObjectId),
    );
    expect(
      second.plan.candidates.every((item) => !firstIds.has(item.boardObjectId)),
    ).toBe(true);
    expect(first.plan.rootGroupId).not.toBe(second.plan.rootGroupId);
  });

  it("resolves every current GIR object and constraint reference kind", () => {
    const result = plan(fullReferenceGir());
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.references.length).toBeGreaterThan(40);
    expect(
      result.diagnostics.filter(
        (item) => item.code === "geometry-import.unsupported-visual-entity",
      ),
    ).toHaveLength(6);
  });

  it("rejects duplicate object IDs without a partial plan", () => {
    const gir = triangleAltitudeGir() as {
      objects: JsonValue[];
      [key: string]: JsonValue;
    };
    const result = plan({
      ...gir,
      objects: [...gir.objects, gir.objects[0] as JsonValue],
    });
    expect(result).toMatchObject({
      status: "failure",
      code: "geometry-import.duplicate-object-id",
    });
    expect("plan" in result).toBe(false);
  });

  it("rejects missing and wrong-kind references explicitly", () => {
    const missing = triangleAltitudeGir() as {
      objects: JsonValue[];
      [key: string]: JsonValue;
    };
    const missingObjects = missing.objects.map((value) => {
      const object = value as Record<string, JsonValue>;
      return object.id === "AH"
        ? { ...object, points: ["A", "missing"] }
        : value;
    });
    expect(plan({ ...missing, objects: missingObjects })).toMatchObject({
      status: "failure",
      code: "geometry-import.missing-reference",
    });

    const wrong = triangleAltitudeGir() as {
      objects: JsonValue[];
      [key: string]: JsonValue;
    };
    const wrongObjects = wrong.objects.map((value) => {
      const object = value as Record<string, JsonValue>;
      return object.id === "AH" ? { ...object, points: ["A", "BC"] } : value;
    });
    expect(plan({ ...wrong, objects: wrongObjects })).toMatchObject({
      status: "failure",
      code: "geometry-import.reference-kind-mismatch",
    });
  });

  it("rejects ambiguous explicit representations of one triangle edge", () => {
    const gir = triangleAltitudeGir() as {
      objects: JsonValue[];
      [key: string]: JsonValue;
    };
    const result = plan({
      ...gir,
      objects: [
        ...gir.objects,
        { id: "BC-duplicate", points: ["C", "B"], type: "segment" },
      ],
    });
    expect(result).toMatchObject({
      status: "failure",
      code: "geometry-import.ambiguous-triangle-edge",
    });
  });

  it("prefers explicit labels over synthetic point labels", () => {
    const gir = triangleAltitudeGir() as {
      objects: JsonValue[];
      [key: string]: JsonValue;
    };
    const result = plan({
      ...gir,
      objects: [
        ...gir.objects,
        { id: "label-A", target: "A", text: "Vertex A", type: "label" },
      ],
    });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const labelsForA = result.plan.candidates.filter(
      (candidate) =>
        candidate.kind === "label" && candidate.targetGirEntityId === "A",
    );
    expect(labelsForA).toHaveLength(1);
    expect(labelsForA[0]).toMatchObject({
      origin: { kind: "explicit-label", girEntityId: "label-A" },
    });
  });

  it("rejects duplicate IDs in constraint and construction-step namespaces", () => {
    const source = triangleAltitudeGir() as {
      constraints: JsonValue[];
      construction_steps: JsonValue[];
      [key: string]: JsonValue;
    };
    expect(
      plan({
        ...source,
        constraints: [
          ...source.constraints,
          source.constraints[0] as JsonValue,
        ],
      }),
    ).toMatchObject({
      status: "failure",
      code: "geometry-import.duplicate-constraint-id",
    });
    expect(
      plan({
        ...source,
        construction_steps: [
          ...source.construction_steps,
          source.construction_steps[0] as JsonValue,
        ],
      }),
    ).toMatchObject({
      status: "failure",
      code: "geometry-import.duplicate-construction-step-id",
    });
  });

  it("rejects degenerate point references explicitly", () => {
    const source = triangleAltitudeGir() as {
      objects: JsonValue[];
      [key: string]: JsonValue;
    };
    const objects = source.objects.map((value) => {
      const object = value as Record<string, JsonValue>;
      return object.id === "AH" ? { ...object, points: ["A", "A"] } : value;
    });
    expect(plan({ ...source, objects })).toMatchObject({
      status: "failure",
      code: "geometry-import.degenerate-reference",
    });
  });

  it("enforces bounded entity and label complexity", () => {
    const tooManyObjects: JsonValue = {
      schema_version: "0.2.0",
      scene_type: "2d",
      objects: Array.from(
        { length: geometryImportLimits.maxObjects + 1 },
        (_, index) => ({ id: `P${index}`, type: "point" }),
      ),
      constraints: [],
      construction_steps: [],
    };
    expect(plan(tooManyObjects)).toMatchObject({
      status: "failure",
      code: "geometry-import.complexity-limit-exceeded",
    });

    const source = triangleAltitudeGir() as {
      objects: JsonValue[];
      [key: string]: JsonValue;
    };
    const objects = source.objects.map((value) => {
      const object = value as Record<string, JsonValue>;
      return object.id === "A"
        ? {
            ...object,
            label: "x".repeat(geometryImportLimits.maxLabelCodePoints + 1),
          }
        : value;
    });
    expect(plan({ ...source, objects })).toMatchObject({
      status: "failure",
      code: "geometry-import.complexity-limit-exceeded",
    });
  });

  it("bounds the normalized reference graph", () => {
    const source = triangleAltitudeGir() as Record<string, JsonValue>;
    const result = plan({
      ...source,
      construction_steps: [
        {
          action: "bounded-reference-test",
          id: "large-step",
          objects: Array.from(
            { length: geometryImportLimits.maxReferences + 1 },
            () => "A",
          ),
        },
      ],
    });
    expect(result).toMatchObject({
      status: "failure",
      code: "geometry-import.complexity-limit-exceeded",
    });
  });
  it("rejects malformed GIR through the generated runtime boundary", () => {
    expect(plan({ schema_version: "0.2.0" })).toMatchObject({
      status: "failure",
      code: "geometry-import.invalid-gir",
    });
  });

  it("fails rather than truncating an identity that exceeds the core contract", () => {
    expect(plan(triangleAltitudeGir(), `i${"x".repeat(119)}`)).toMatchObject({
      status: "failure",
      code: "geometry-import.generated-id-too-long",
    });
  });

  it("rejects empty semantic IDs even when the transport schema accepts strings", () => {
    const gir = triangleAltitudeGir() as {
      objects: JsonValue[];
      [key: string]: JsonValue;
    };
    const objects = gir.objects.map((value) => {
      const object = value as Record<string, JsonValue>;
      return object.id === "A" ? { ...object, id: "" } : value;
    });
    expect(plan({ ...gir, objects })).toMatchObject({
      status: "failure",
      code: "geometry-import.invalid-gir",
    });
  });

  it("rejects unsupported GIR versions before mapping", () => {
    const gir = {
      ...(triangleAltitudeGir() as Record<string, JsonValue>),
      schema_version: "0.3.0",
    };
    expect(plan(gir)).toMatchObject({
      status: "failure",
      code: "geometry-import.unsupported-gir-version",
    });
  });

  it("rejects a valid but empty scene", () => {
    expect(
      plan({
        schema_version: "0.2.0",
        scene_type: "2d",
        objects: [],
        constraints: [],
        construction_steps: [],
      }),
    ).toMatchObject({
      status: "failure",
      code: "geometry-import.no-supported-visual-entities",
    });
  });

  it("does not mutate canonical GIR", () => {
    const gir = triangleAltitudeGir();
    const before = JSON.stringify(gir);
    plan(gir);
    expect(JSON.stringify(gir)).toBe(before);
  });
});
