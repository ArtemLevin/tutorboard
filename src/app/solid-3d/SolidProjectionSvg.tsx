import { useMemo, type ReactElement } from "react";
import {
  buildSolidProjectionViewModel,
  type SolidCameraPreset,
  type SolidElementRef,
  type SolidSectionResult,
  type SolidTopology,
} from "../../core/public";

export interface SolidProjectionSvgProps {
  readonly highlighted: SolidElementRef | null;
  readonly onHighlight: (element: SolidElementRef | null) => void;
  readonly preset: SolidCameraPreset;
  readonly section: SolidSectionResult | null;
  readonly showHiddenEdges: boolean;
  readonly topology: SolidTopology;
}

const presetLabels: Readonly<Record<SolidCameraPreset, string>> = {
  front: "Спереди",
  isometric: "Изометрия",
  side: "Сбоку",
  top: "Сверху",
};

export function SolidProjectionSvg({
  highlighted,
  onHighlight,
  preset,
  section,
  showHiddenEdges,
  topology,
}: SolidProjectionSvgProps): ReactElement {
  const model = useMemo(
    () => buildSolidProjectionViewModel(topology, preset, section),
    [preset, section, topology],
  );
  const nodes = new Map(model.nodes.map((node) => [node.id, node]));
  return (
    <figure className="solid-learning-projection">
      <figcaption>{presetLabels[preset]}</figcaption>
      <svg
        aria-label={`${presetLabels[preset]}: проекция объёмной фигуры`}
        role="img"
        viewBox={model.viewBox.join(" ")}
      >
        {model.edges.map((edge) => {
          const from = nodes.get(edge.from)!;
          const to = nodes.get(edge.to)!;
          if (edge.hidden && !showHiddenEdges) return null;
          return (
            <line
              className={[
                "solid-learning-edge",
                edge.hidden ? "is-hidden" : "",
                highlighted?.kind === "edge" && highlighted.id === edge.id
                  ? "is-highlighted"
                  : "",
              ].join(" ")}
              key={edge.id}
              onFocus={() => onHighlight({ id: edge.id, kind: "edge" })}
              onMouseEnter={() => onHighlight({ id: edge.id, kind: "edge" })}
              tabIndex={0}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          );
        })}
        {model.sectionPath.length >= 3 ? (
          <polygon
            className="solid-learning-section-polygon"
            points={model.sectionPath
              .map(({ x, y }) => `${String(x)},${String(y)}`)
              .join(" ")}
          />
        ) : null}
        {model.nodes.map((node) => (
          <g
            className={
              highlighted?.kind === "vertex" && highlighted.id === node.id
                ? "is-highlighted"
                : undefined
            }
            key={node.id}
            onFocus={() => onHighlight({ id: node.id, kind: "vertex" })}
            onMouseEnter={() => onHighlight({ id: node.id, kind: "vertex" })}
            tabIndex={0}
          >
            <circle cx={node.x} cy={node.y} r={model.viewBox[2] / 90} />
            <text
              x={node.x + model.viewBox[2] / 65}
              y={node.y - model.viewBox[3] / 65}
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
