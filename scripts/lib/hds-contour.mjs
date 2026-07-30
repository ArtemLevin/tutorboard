const maximumDimension = 512;
const minimumForegroundDifference = 10;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function luminance(red, green, blue, alpha) {
  const opacity = alpha / 255;
  const compositedRed = red * opacity + 255 * (1 - opacity);
  const compositedGreen = green * opacity + 255 * (1 - opacity);
  const compositedBlue = blue * opacity + 255 * (1 - opacity);
  return (
    compositedRed * 0.2126 + compositedGreen * 0.7152 + compositedBlue * 0.0722
  );
}

function otsuThreshold(values) {
  const histogram = Array.from({ length: 256 }, () => 0);
  let sum = 0;
  for (const value of values) {
    const bucket = Math.max(0, Math.min(255, Math.round(value)));
    histogram[bucket] += 1;
    sum += bucket;
  }
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maximumVariance = -1;
  let threshold = 0;
  for (let bucket = 0; bucket < histogram.length; bucket += 1) {
    backgroundWeight += histogram[bucket];
    if (backgroundWeight === 0) {
      continue;
    }
    const foregroundWeight = values.length - backgroundWeight;
    if (foregroundWeight === 0) {
      break;
    }
    backgroundSum += bucket * histogram[bucket];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) ** 2;
    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = bucket;
    }
  }
  return threshold;
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] === 1) {
      continue;
    }
    const component = [];
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && mask[neighbor] === 1 && visited[neighbor] === 0) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components.sort((left, right) => right.length - left.length);
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function traceBoundary(component, width, height) {
  const pixels = new Set(component);
  const edges = [];
  const addEdge = (start, end) => {
    edges.push({ end, start, used: false });
  };

  for (const pixel of component) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (y === 0 || !pixels.has(pixel - width)) {
      addEdge({ x, y }, { x: x + 1, y });
    }
    if (x + 1 === width || !pixels.has(pixel + 1)) {
      addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    }
    if (y + 1 === height || !pixels.has(pixel + width)) {
      addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    }
    if (x === 0 || !pixels.has(pixel - 1)) {
      addEdge({ x, y: y + 1 }, { x, y });
    }
  }

  const outgoing = new Map();
  for (const edge of edges) {
    const key = pointKey(edge.start);
    const existing = outgoing.get(key) ?? [];
    existing.push(edge);
    outgoing.set(key, existing);
  }

  const loops = [];
  for (const firstEdge of edges) {
    if (firstEdge.used) {
      continue;
    }
    const loop = [firstEdge.start];
    firstEdge.used = true;
    let current = firstEdge.end;
    const startKey = pointKey(firstEdge.start);
    for (let step = 0; step <= edges.length; step += 1) {
      if (pointKey(current) === startKey) {
        break;
      }
      loop.push(current);
      const next = (outgoing.get(pointKey(current)) ?? []).find(
        (edge) => !edge.used,
      );
      if (next === undefined) {
        break;
      }
      next.used = true;
      current = next.end;
    }
    if (pointKey(current) === startKey && loop.length >= 4) {
      loops.push(loop);
    }
  }

  const largest = loops.sort(
    (left, right) => Math.abs(polygonArea(right)) - Math.abs(polygonArea(left)),
  )[0];
  if (largest === undefined) {
    throw new Error("HDS raster has no closed dominant contour.");
  }
  return largest;
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function convexHull(points) {
  const sorted = [...points].sort((left, right) =>
    left.x === right.x ? left.y - right.y : left.x - right.x,
  );
  const cross = (origin, left, right) =>
    (left.x - origin.x) * (right.y - origin.y) -
    (left.y - origin.y) * (right.x - origin.x);
  const half = [];
  const append = (point) => {
    while (half.length >= 2 && cross(half.at(-2), half.at(-1), point) <= 0) {
      half.pop();
    }
    half.push(point);
  };
  for (const point of sorted) {
    append(point);
  }
  const lowerLength = half.length;
  for (let index = sorted.length - 2; index > 0; index -= 1) {
    append(sorted[index]);
  }
  if (half.length > lowerLength) {
    half.pop();
  }
  return half;
}

function perimeter(points) {
  let result = 0;
  for (let index = 0; index < points.length; index += 1) {
    result += distance(points[index], points[(index + 1) % points.length]);
  }
  return result;
}

function assertContourQuality(points) {
  const hull = convexHull(points);
  const hullArea = Math.abs(polygonArea(hull));
  const hullPerimeter = perimeter(hull);
  const solidity =
    hullArea === 0 ? 0 : Math.abs(polygonArea(points)) / hullArea;
  const perimeterRatio =
    hullPerimeter === 0
      ? Number.POSITIVE_INFINITY
      : perimeter(points) / hullPerimeter;
  if (solidity < 0.3 || perimeterRatio > 1.7) {
    throw new Error("HDS raster contour is too concave or fragmented.");
  }
}

function resampleClosed(points, pointCount) {
  const closed = [...points, points[0]];
  const cumulative = [0];
  for (let index = 1; index < closed.length; index += 1) {
    cumulative.push(
      cumulative[index - 1] + distance(closed[index - 1], closed[index]),
    );
  }
  const total = cumulative.at(-1);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("HDS contour is degenerate.");
  }

  const output = [];
  let segment = 1;
  for (let index = 0; index < pointCount; index += 1) {
    const target = (index / (pointCount - 1)) * total;
    while (segment < cumulative.length - 1 && cumulative[segment] < target) {
      segment += 1;
    }
    const startDistance = cumulative[segment - 1];
    const endDistance = cumulative[segment];
    const progress =
      endDistance === startDistance
        ? 0
        : (target - startDistance) / (endDistance - startDistance);
    const start = closed[segment - 1];
    const end = closed[segment];
    output.push({
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    });
  }
  return output;
}

export function extractHdsDominantContour(raster, options = {}) {
  const { data, height, width } = raster;
  const pointCount = options.pointCount ?? 128;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > maximumDimension ||
    height > maximumDimension ||
    !(data instanceof Uint8Array) ||
    data.length !== width * height * 4
  ) {
    throw new Error("HDS raster must be bounded RGBA data.");
  }
  if (!Number.isInteger(pointCount) || pointCount < 16 || pointCount > 512) {
    throw new Error("HDS contour pointCount must be between 16 and 512.");
  }

  const brightness = [];
  const borderBrightness = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = luminance(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
      );
      brightness.push(value);
      if (x === 0 || y === 0 || x + 1 === width || y + 1 === height) {
        borderBrightness.push(value);
      }
    }
  }
  const background = median(borderBrightness);
  const differences = brightness.map((value) => Math.abs(value - background));
  const maximumDifference = Math.max(...differences);
  if (maximumDifference < minimumForegroundDifference) {
    throw new Error("HDS raster has insufficient foreground contrast.");
  }
  const threshold = Math.max(
    minimumForegroundDifference,
    otsuThreshold(differences),
  );
  const mask = Uint8Array.from(differences, (difference) =>
    difference >= threshold ? 1 : 0,
  );
  const components = connectedComponents(mask, width, height);
  const dominant = components[0];
  const foregroundCount = components.reduce(
    (sum, component) => sum + component.length,
    0,
  );
  if (
    dominant === undefined ||
    dominant.length < 12 ||
    dominant.length / foregroundCount < 0.7
  ) {
    throw new Error("HDS raster has no sufficiently dominant component.");
  }

  const contour = resampleClosed(
    traceBoundary(dominant, width, height),
    pointCount,
  );
  assertContourQuality(contour);
  return contour;
}
