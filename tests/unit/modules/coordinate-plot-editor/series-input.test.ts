import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  plotParameterId,
  plotSeriesId,
} from "../../../../src/core/public";
import {
  createDefaultCoordinatePlotObject,
  updateCoordinatePlotSeriesInput,
} from "../../../../src/modules/coordinate-plot-editor/public";

function definition() {
  let series = 0;
  let parameter = 0;
  return createDefaultCoordinatePlotObject({
    center: { x: 0, y: 0 },
    ids: {
      objectId: boardObjectId("object:plot:test"),
      parameterId: () => plotParameterId(`parameter:test:${++parameter}`),
      seriesId: () => plotSeriesId(`series:test:${++series}`),
    },
  }).definition;
}

describe("coordinate plot relation boundary policy", () => {
  it("uses a dashed boundary for strict inequalities", () => {
    const initial = definition();
    const seriesId = initial.series[0]!.id;
    const updated = updateCoordinatePlotSeriesInput(initial, seriesId, "y < x");
    const series = updated.series[0]!;

    expect(series.kind).toBe("relation");
    expect(series.style.lineStyle).toBe("dashed");
  });

  it("uses a solid boundary for inclusive inequalities", () => {
    const initial = definition();
    const seriesId = initial.series[0]!.id;
    const strict = updateCoordinatePlotSeriesInput(initial, seriesId, "y > x");
    const updated = updateCoordinatePlotSeriesInput(strict, seriesId, "y >= x");
    const series = updated.series[0]!;

    expect(series.kind).toBe("relation");
    expect(series.style.lineStyle).toBe("solid");
  });
});
