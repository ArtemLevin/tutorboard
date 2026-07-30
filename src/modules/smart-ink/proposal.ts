import type {
  BoardObject,
  ObjectStyle,
  PenStrokeObject,
  UserObjectSource,
  Vec2,
} from "../../core/public";
import {
  recognizeSmartInkStroke,
  type SmartInkCandidate,
  type SmartInkPrimitiveKind,
  type SmartInkProposal,
} from "../smart-ink-spike/public";
import {
  recordSmartInkDiagnostic,
  smartInkDiagnosticSchemaVersion,
  type SmartInkDiagnosticReason,
} from "./diagnostics";

const minimumGeometrySize = 0.001;

export const smartInkCanvasRecognitionPolicy = {
  ambiguityMargin: 0.02,
  circle: {
    minimumAxisRatio: 0.75,
    minimumCandidateConfidence: 0.25,
  },
  minimumConfidence: 0.34,
  sampleCount: 96,
} as const;

const primitiveLabels: Readonly<Record<SmartInkPrimitiveKind, string>> = {
  circle: "Окружность",
  ellipse: "Эллипс",
  line: "Линия",
  rectangle: "Прямоугольник",
  square: "Квадрат",
  triangle: "Треугольник",
};

export interface SmartInkBoardProposal {
  readonly candidate: SmartInkCandidate;
  readonly label: string;
  readonly original: PenStrokeObject;
  readonly preview: BoardObject;
  readonly recognizer: SmartInkProposal;
  readonly replacement: BoardObject;
}

export type SmartInkBoardProposalResult =
  | {
      readonly proposal: SmartInkBoardProposal;
      readonly status: "proposed";
    }
  | {
      readonly recognizer: SmartInkProposal;
      readonly status: "skipped";
    };

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function rotate(point: Vec2, rotation: number): Vec2 {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function strokeWorldPoints(stroke: PenStrokeObject): readonly Vec2[] {
  return stroke.points.map((point) => {
    const transformed = rotate(
      {
        x: point.x * stroke.scale.x,
        y: point.y * stroke.scale.y,
      },
      stroke.rotation,
    );
    return {
      x: transformed.x + stroke.position.x,
      y: transformed.y + stroke.position.y,
    };
  });
}

function base(
  stroke: PenStrokeObject,
  position: Vec2,
  rotation = 0,
): {
  readonly groupId: null;
  readonly id: PenStrokeObject["id"];
  readonly locked: false;
  readonly position: Vec2;
  readonly rotation: number;
  readonly scale: Vec2;
  readonly source: UserObjectSource;
  readonly style: ObjectStyle;
  readonly visible: boolean;
} {
  return {
    groupId: null,
    id: stroke.id,
    locked: false,
    position,
    rotation,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: stroke.style,
    visible: stroke.visible,
  };
}

export function createSmartInkReplacementObject(
  stroke: PenStrokeObject,
  candidate: SmartInkCandidate,
): BoardObject | null {
  const geometry = candidate.geometry;
  switch (geometry.kind) {
    case "line": {
      const end = {
        x: geometry.end.x - geometry.start.x,
        y: geometry.end.y - geometry.start.y,
      };
      return Math.hypot(end.x, end.y) < minimumGeometrySize
        ? null
        : {
            ...base(stroke, geometry.start),
            end,
            kind: "drawing.line",
          };
    }
    case "circle":
      return geometry.radius < minimumGeometrySize
        ? null
        : {
            ...base(stroke, geometry.center),
            kind: "drawing.ellipse",
            radius: { x: geometry.radius, y: geometry.radius },
          };
    case "ellipse":
      return geometry.radius.x < minimumGeometrySize ||
        geometry.radius.y < minimumGeometrySize
        ? null
        : {
            ...base(stroke, geometry.center, degrees(geometry.rotation)),
            kind: "drawing.ellipse",
            radius: geometry.radius,
          };
    case "rectangle":
    case "square": {
      const [first, second, third] = geometry.vertices;
      if (first === undefined || second === undefined || third === undefined) {
        return null;
      }
      const width = distance(first, second);
      const height = distance(second, third);
      return width < minimumGeometrySize || height < minimumGeometrySize
        ? null
        : {
            ...base(
              stroke,
              first,
              degrees(Math.atan2(second.y - first.y, second.x - first.x)),
            ),
            kind: "drawing.rectangle",
            size: { height, width },
          };
    }
    case "triangle": {
      const first = geometry.vertices[0];
      if (first === undefined || geometry.vertices.length !== 3) {
        return null;
      }
      return {
        ...base(stroke, first),
        kind: "drawing.pen-stroke",
        points: [
          ...geometry.vertices.map((point) => ({
            x: point.x - first.x,
            y: point.y - first.y,
          })),
          { x: 0, y: 0 },
        ],
      };
    }
  }
}

function previewStyle(style: ObjectStyle): ObjectStyle {
  return {
    ...style,
    fill: null,
    opacity: 0.92,
    stroke: "#0f8a75",
    strokeWidth: Math.max(4, style.strokeWidth),
  };
}

function selectCanvasCandidate(
  recognizer: SmartInkProposal,
): SmartInkCandidate | undefined {
  const candidate = recognizer.candidates[0];
  if (recognizer.status !== "recognized" || candidate === undefined) {
    return undefined;
  }
  if (candidate.kind !== "ellipse") {
    return candidate;
  }
  const circle = recognizer.candidates.find(
    (alternative) => alternative.kind === "circle",
  );
  const axisRatio = candidate.diagnostics.axisRatio;
  return circle !== undefined &&
    axisRatio !== undefined &&
    axisRatio >= smartInkCanvasRecognitionPolicy.circle.minimumAxisRatio &&
    circle.confidence >=
      smartInkCanvasRecognitionPolicy.circle.minimumCandidateConfidence
    ? circle
    : candidate;
}

function diagnosticReason(
  recognizer: SmartInkProposal,
  candidate: SmartInkCandidate | undefined,
  replacement: BoardObject | null,
): SmartInkDiagnosticReason {
  if (recognizer.status === "ambiguous") {
    return "recognizer-ambiguous";
  }
  if (recognizer.status === "unrecognized" || candidate === undefined) {
    return "recognizer-unrecognized";
  }
  return replacement === null
    ? "replacement-not-renderable"
    : "proposal-created";
}

export function proposeSmartInkReplacement(
  stroke: PenStrokeObject,
): SmartInkBoardProposalResult {
  const points = strokeWorldPoints(stroke);
  const recognizer = recognizeSmartInkStroke(stroke.id, points, {
    ambiguityMargin: smartInkCanvasRecognitionPolicy.ambiguityMargin,
    minimumConfidence: smartInkCanvasRecognitionPolicy.minimumConfidence,
    sampleCount: smartInkCanvasRecognitionPolicy.sampleCount,
  });
  const candidate = selectCanvasCandidate(recognizer);
  const replacement =
    candidate === undefined
      ? null
      : createSmartInkReplacementObject(stroke, candidate);

  recordSmartInkDiagnostic({
    outcome: replacement === null ? "skipped" : "proposed",
    points: points.map((point) => ({ ...point })),
    reason: diagnosticReason(recognizer, candidate, replacement),
    recognizer,
    replacementKind: replacement?.kind ?? null,
    schemaVersion: smartInkDiagnosticSchemaVersion,
    selectedCandidateKind: candidate?.kind ?? null,
    sourcePointCount: stroke.points.length,
  });

  if (candidate === undefined || replacement === null) {
    return { recognizer, status: "skipped" };
  }
  return {
    proposal: {
      candidate,
      label: primitiveLabels[candidate.kind],
      original: stroke,
      preview: {
        ...replacement,
        style: previewStyle(replacement.style),
      },
      recognizer,
      replacement,
    },
    status: "proposed",
  };
}
