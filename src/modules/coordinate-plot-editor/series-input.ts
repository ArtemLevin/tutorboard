import {
  parsePlotRelation,
  type CoordinatePlotDefinition,
  type PlotSeriesId,
} from "../../core/public";
import { updateCoordinatePlotSeriesInput as updateModelSeriesInput } from "./model";

function strictBoundary(expression: string): boolean {
  const relation = parsePlotRelation(expression);
  return (
    relation.ok && (relation.operator === "<" || relation.operator === ">")
  );
}

export function updateCoordinatePlotSeriesInput(
  definition: CoordinatePlotDefinition,
  seriesId: PlotSeriesId,
  source: string,
): CoordinatePlotDefinition {
  const updated = updateModelSeriesInput(definition, seriesId, source);
  const index = updated.series.findIndex(({ id }) => id === seriesId);
  const series = updated.series[index];
  if (index < 0 || series?.kind !== "relation") return updated;

  const lineStyle = strictBoundary(series.expression) ? "dashed" : "solid";
  if (series.style.lineStyle === lineStyle) return updated;

  const nextSeries = [...updated.series];
  nextSeries[index] = {
    ...series,
    style: { ...series.style, lineStyle },
  };
  return { ...updated, series: nextSeries };
}
