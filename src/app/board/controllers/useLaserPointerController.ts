import { useCallback, useEffect, useRef, useState } from "react";

import type { Vec2 } from "../../../core/public";

const fadeDurationMs = 900;
const frameMs = 40;
const maximumPoints = 96;
const minimumDistance = 1.5;

function appendPoint(points: readonly Vec2[], point: Vec2): readonly Vec2[] {
  const previous = points.at(-1);
  if (
    previous !== undefined &&
    Math.hypot(point.x - previous.x, point.y - previous.y) < minimumDistance
  ) {
    return points;
  }
  return [...points.slice(-(maximumPoints - 1)), point];
}

export function useLaserPointerController() {
  const [point, setPoint] = useState<Vec2 | null>(null);
  const [trailOpacity, setTrailOpacity] = useState(0);
  const [trailPoints, setTrailPoints] = useState<readonly Vec2[]>([]);
  const fadeTimerRef = useRef<number | null>(null);

  const stopFade = useCallback(() => {
    if (fadeTimerRef.current === null) return;
    window.clearInterval(fadeTimerRef.current);
    fadeTimerRef.current = null;
  }, []);

  const clear = useCallback(() => {
    stopFade();
    setPoint(null);
    setTrailOpacity(0);
    setTrailPoints([]);
  }, [stopFade]);

  const start = useCallback(
    (nextPoint: Vec2) => {
      stopFade();
      setPoint(nextPoint);
      setTrailOpacity(1);
      setTrailPoints([nextPoint]);
    },
    [stopFade],
  );

  const hover = useCallback((nextPoint: Vec2) => {
    setPoint(nextPoint);
  }, []);

  const move = useCallback((nextPoint: Vec2) => {
    setPoint(nextPoint);
    setTrailPoints((points) => appendPoint(points, nextPoint));
  }, []);

  const moveBatch = useCallback((points: readonly Vec2[]) => {
    const finalPoint = points.at(-1);
    if (finalPoint === undefined) return;
    setPoint(finalPoint);
    setTrailPoints((current) =>
      points.reduce((trail, item) => appendPoint(trail, item), current),
    );
  }, []);

  const finish = useCallback(
    (nextPoint: Vec2) => {
      setTrailPoints((points) => appendPoint(points, nextPoint));
      setPoint(null);
      stopFade();
      const startedAtMs = performance.now();
      setTrailOpacity(1);
      fadeTimerRef.current = window.setInterval(() => {
        const elapsedMs = performance.now() - startedAtMs;
        const opacity = Math.max(0, 1 - elapsedMs / fadeDurationMs);
        setTrailOpacity(opacity);
        if (opacity > 0) return;
        stopFade();
        setTrailPoints([]);
      }, frameMs);
    },
    [stopFade],
  );

  useEffect(() => stopFade, [stopFade]);

  return {
    clear,
    finish,
    hover,
    move,
    moveBatch,
    point,
    start,
    trailOpacity,
    trailPoints,
  } as const;
}

export type LaserPointerController = ReturnType<
  typeof useLaserPointerController
>;
