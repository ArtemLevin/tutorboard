import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  coordinatePlotExpressionLanguage,
  type BoardSceneReadModel,
  type CoordinatePlotObject,
} from "../../core/public";
import { selectObjectIdsInLasso, selectObjectIdsInRect } from "./geometry";

const plot: CoordinatePlotObject = {
  definition: {
    axes: {
      showArrows: true,
      showLabels: true,
      showXAxis: true,
      showYAxis: true,
      xLabel: "x",
      yLabel: "y",
    },
    coordinateViewport: {
      equalScale: true,
      xMax: 10,
      xMin: -10,
      yMax: 10,
      yMin: -10,
    },
    expressionLanguage: coordinatePlotExpressionLanguage,
    grid: {
      automaticStep: true,
      majorVisible: true,
      minorVisible: false,
      visible: true,
      xStep: null,
      yStep: null,
    },
    legend: { position: "top-right", visible: true },
    parameters: [],
    series: [],
    size: { height: 200, width: 300 },
  },
  groupId: null,
  id: boardObjectId("plot-selection"),
  kind: "math.coordinate-plot",
  locked: false,
  position: { x: 100, y: 100 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  source: { kind: "user" },
  style: {
    fill: "#fff",
    opacity: 1,
    stroke: "#000",
    strokeWidth: 1,
  },
  visible: true,
};
const scene: BoardSceneReadModel = {
  items: [{ object: plot, transforms: [] }],
  viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
};

describe("coordinate plot selection geometry", () => {
  it("participates in marquee selection", () => {
    expect(
      selectObjectIdsInRect(scene, {
        height: 40,
        width: 40,
        x: 90,
        y: 90,
      }),
    ).toEqual([plot.id]);
  });

  it("participates in lasso selection", () => {
    expect(
      selectObjectIdsInLasso(scene, [
        { x: 80, y: 80 },
        { x: 430, y: 80 },
        { x: 430, y: 330 },
        { x: 80, y: 330 },
      ]),
    ).toEqual([plot.id]);
  });
});
