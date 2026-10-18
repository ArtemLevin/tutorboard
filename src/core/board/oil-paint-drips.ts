import type { VectorInkBounds, VectorInkData } from "./vector-ink";

export interface OilPaintDrips {
  readonly bounds: VectorInkBounds | null;
  readonly data: string;
}

interface OilPaintPhase {
  readonly continuousStylePhase?: boolean;
  readonly distanceOffset?: number;
}

const maximumDrips = 16;
const minimumDripWidth = 3;

function paintHash(index: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0xffffffff;
}

function coordinate(value: number): string {
  return value.toFixed(2);
}

/**
 * Gravity-aligned paint runs. Every drip is a closed filled subpath of the
 * primary impasto contour, so a long stroke still occupies three renderer
 * nodes. Fixed distance markers preserve a stable phase across incremental
 * previews and partial-eraser fragments.
 */
export function createOilPaintDrips(
  ink: VectorInkData,
  strokeWidth: number,
  options: OilPaintPhase = {},
): OilPaintDrips {
  if (
    ink.closed ||
    ink.samples.length < 2 ||
    !Number.isFinite(strokeWidth) ||
    strokeWidth < minimumDripWidth
  ) {
    return { bounds: null, data: "" };
  }

  const spacing = Math.max(35, Math.min(120, strokeWidth * 3.3));
  const offset = options.continuousStylePhase
    ? Math.max(0, options.distanceOffset ?? 0)
    : 0;
  let nextIndex = Math.max(1, Math.ceil((offset + spacing * 0.7) / spacing));
  let nextMark = nextIndex * spacing;
  let travelled = offset;
  let count = 0;
  const paths: string[] = [];
  let bounds: VectorInkBounds | null = null;

  for (let index = 1; index < ink.samples.length && count < maximumDrips; index += 1) {
    const start = ink.samples[index - 1]!;
    const end = ink.samples[index]!;
    const segment = Math.hypot(
      end.point.x - start.point.x,
      end.point.y - start.point.y,
    );
    if (segment <= 1e-9) continue;

    const speed = segment / Math.max(1, end.timestampMs - start.timestampMs);
    while (nextMark <= travelled + segment && count < maximumDrips) {
      const ratio = (nextMark - travelled) / segment;
      const hash = paintHash(nextIndex);
      const pressure = Math.max(
        0,
        Math.min(1, start.pressure + (end.pressure - start.pressure) * ratio),
      );
      const horizontal = Math.abs(end.point.x - start.point.x) / segment;
      // Sparse runs hang from generously loaded, predominantly lateral swipes.
      if (hash > 0.18 && horizontal >= 0.48 && pressure >= 0.2) {
        const x =
          start.point.x + (end.point.x - start.point.x) * ratio;
        const y =
          start.point.y +
          (end.point.y - start.point.y) * ratio +
          strokeWidth * (0.48 + 0.35 * pressure);
        const flow = (0.8 + pressure * 0.85) /
          (1 + Math.min(3, speed) * 0.22);
        const length = Math.min(
          strokeWidth * 4.2,
          strokeWidth * (0.85 + 1.7 * hash) * flow,
        );
        const half = strokeWidth * (0.06 + pressure * 0.11);
        const bottom = y + length;
        const left = x - half;
        const right = x + half;
        paths.push(
          `M ${coordinate(left)} ${coordinate(y)} ` +
            `C ${coordinate(x - half * 1.3)} ${coordinate(y + length * 0.35)} ` +
            `${coordinate(x - half * 0.45)} ${coordinate(bottom - half)} ` +
            `${coordinate(x - half * 0.45)} ${coordinate(bottom)} ` +
            `C ${coordinate(x - half * 0.4)} ${coordinate(bottom + half * 0.7)} ` +
            `${coordinate(x + half * 0.4)} ${coordinate(bottom + half * 0.7)} ` +
            `${coordinate(x + half * 0.45)} ${coordinate(bottom)} ` +
            `C ${coordinate(x + half * 0.45)} ${coordinate(bottom - half)} ` +
            `${coordinate(x + half * 1.3)} ${coordinate(y + length * 0.3)} ` +
            `${coordinate(right)} ${coordinate(y)} Z`,
        );
        const dripBounds = {
          left: x - half * 1.4,
          right: x + half * 1.4,
          top: y,
          bottom: bottom + half,
        };
        bounds = bounds === null
          ? dripBounds
          : {
              left: Math.min(bounds.left, dripBounds.left),
              right: Math.max(bounds.right, dripBounds.right),
              top: Math.min(bounds.top, dripBounds.top),
              bottom: Math.max(bounds.bottom, dripBounds.bottom),
            };
        count += 1;
      }
      nextIndex += 1;
      nextMark = nextIndex * spacing;
    }
    travelled += segment;
  }
  return { bounds, data: paths.join(" ") };
}
