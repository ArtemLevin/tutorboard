import {
  maximumCoordinatePlotParameters,
  type BoardDocument,
  type BoardObjectId,
  type CommandMetadata,
  type CoordinatePlotObject,
  type PenStrokeObject,
  type PlotParameterId,
  type PlotSeriesId,
  type ReplaceObjectsCommand,
} from "../core/public";
import {
  createDefaultCoordinatePlotObject,
  fitCoordinatePlotDefinition,
} from "../modules/coordinate-plot-editor/public";
import {
  interpretMathInkRecognitionResult,
  mathInkRecognitionResultSchemaVersion,
  type HandwrittenFunctionBounds,
  type HandwrittenFunctionInterpretation,
  type HandwrittenFunctionInterpretedCandidate,
  type HandwrittenFunctionStroke,
} from "../modules/handwritten-function/public";
import {
  drawingStyleDefaults,
  simplifyStroke,
} from "../modules/drawing/public";

export interface HandwrittenFunctionStrokeIdFactory {
  readonly objectId: (
    stroke: HandwrittenFunctionStroke,
    index: number,
  ) => BoardObjectId;
}

export interface HandwrittenFunctionPlotIdFactory {
  readonly objectId: BoardObjectId;
  readonly parameterId: (name: string, index: number) => PlotParameterId;
  readonly seriesId: PlotSeriesId;
}

export function createHandwrittenFunctionStrokeObjects(input: {
  readonly ids: HandwrittenFunctionStrokeIdFactory;
  readonly strokes: readonly HandwrittenFunctionStroke[];
}): readonly PenStrokeObject[] {
  return input.strokes.map((stroke, index) => {
    const points = simplifyStroke(stroke.points.map(({ x, y }) => ({ x, y })));
    if (points.length < 2) {
      throw new Error("Handwritten function stroke has no drawable geometry.");
    }
    return {
      groupId: null,
      id: input.ids.objectId(stroke, index),
      kind: "drawing.pen-stroke",
      locked: false,
      points,
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: drawingStyleDefaults.pen,
      visible: true,
    };
  });
}

export function interpretHandwrittenFunctionDraft(
  expression: string,
): HandwrittenFunctionInterpretation {
  return interpretMathInkRecognitionResult({
    candidates: [
      {
        confidence: 1,
        expression,
        format: "plot-expression",
      },
    ],
    diagnostics: [],
    recognizerId: "tutorboard.manual-expression",
    recognizerVersion: "1",
    schemaVersion: mathInkRecognitionResultSchemaVersion,
    status: "recognized",
  });
}

export function createHandwrittenFunctionPlotObject(input: {
  readonly bounds: HandwrittenFunctionBounds;
  readonly candidate: HandwrittenFunctionInterpretedCandidate;
  readonly ids: HandwrittenFunctionPlotIdFactory;
}): CoordinatePlotObject {
  if (input.candidate.parameters.length > maximumCoordinatePlotParameters) {
    throw new Error("Handwritten function contains too many plot parameters.");
  }
  const center = {
    x: (input.bounds.minX + input.bounds.maxX) / 2,
    y: (input.bounds.minY + input.bounds.maxY) / 2,
  };
  const base = createDefaultCoordinatePlotObject({
    center,
    ids: {
      objectId: input.ids.objectId,
      parameterId: () => input.ids.parameterId("a", 0),
      seriesId: () => input.ids.seriesId,
    },
  });
  const firstSeries = base.definition.series[0];
  if (firstSeries?.kind !== "explicit") {
    throw new Error("Default coordinate plot must contain an explicit series.");
  }
  const definition = fitCoordinatePlotDefinition({
    ...base.definition,
    parameters: input.candidate.parameters.map((name, index) => ({
      id: input.ids.parameterId(name, index),
      max: 10,
      min: -10,
      name,
      step: 0.1,
      value: 1,
    })),
    series: [
      {
        ...firstSeries,
        expression: input.candidate.expression,
        name: "Рукописная функция",
      },
    ],
  });
  return { ...base, definition };
}

export function createHandwrittenFunctionReplaceCommand(
  metadata: CommandMetadata,
  originals: readonly PenStrokeObject[],
  replacement: CoordinatePlotObject,
): ReplaceObjectsCommand {
  if (originals.length === 0) {
    throw new Error("Handwritten function replacement requires source ink.");
  }
  return {
    ...metadata,
    kind: "core.objects.replace",
    originals,
    replacements: [replacement],
  };
}

function sameSnapshot(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function handwrittenFunctionSourceStillApplies(
  document: BoardDocument,
  originals: readonly PenStrokeObject[],
): boolean {
  return (
    originals.length > 0 &&
    originals.every((original) => {
      const current = document.objects[original.id];
      return (
        current?.kind === "drawing.pen-stroke" &&
        sameSnapshot(current, original)
      );
    })
  );
}
