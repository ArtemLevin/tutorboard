import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  clampSolid3DWindowRect,
  initialSolid3DWindowRect,
  type Solid3DWindowRect,
  type Solid3DWorkspaceSize,
} from "./solid-3d-window-geometry";

type GestureKind = "move" | "resize";

function isFullscreenLayout(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(
      "(max-width: 780px), (max-width: 900px) and (max-height: 520px)",
    ).matches
  );
}

export function useSolid3DWindow() {
  const dockRef = useRef<HTMLDivElement>(null);
  const [windowRect, setWindowRect] = useState<Solid3DWindowRect | null>(null);
  const [expanded, setExpanded] = useState(false);
  const compactRectRef = useRef<Solid3DWindowRect | null>(null);
  const gestureRef = useRef<{
    readonly kind: GestureKind;
    readonly pointerId: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly rect: Solid3DWindowRect;
  } | null>(null);

  const workspaceSize = (): Solid3DWorkspaceSize | null => {
    const parent = dockRef.current?.parentElement;
    if (parent === undefined || parent === null) return null;
    const { width, height } = parent.getBoundingClientRect();
    return width > 0 && height > 0 ? { width, height } : null;
  };

  const currentRect = (): Solid3DWindowRect | null => {
    const dock = dockRef.current;
    const parent = dock?.parentElement;
    if (dock === null || parent === undefined || parent === null) return null;
    const bounds = dock.getBoundingClientRect();
    const workspaceBounds = parent.getBoundingClientRect();
    return {
      left: bounds.left - workspaceBounds.left,
      top: bounds.top - workspaceBounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  };

  useEffect(() => {
    const parent = dockRef.current?.parentElement;
    if (parent === undefined || parent === null) return;
    const update = () => {
      const { width, height } = parent.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const size = { width, height };
      setWindowRect((rect) =>
        rect === null
          ? initialSolid3DWindowRect(size)
          : clampSolid3DWindowRect(rect, size),
      );
    };
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(parent);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const toggleExpanded = () => {
    const size = workspaceSize();
    if (size === null) {
      setExpanded((value) => !value);
      return;
    }
    const current =
      windowRect ?? currentRect() ?? initialSolid3DWindowRect(size);
    if (expanded) {
      setWindowRect(
        clampSolid3DWindowRect(compactRectRef.current ?? current, size),
      );
    } else {
      compactRectRef.current = current;
      setWindowRect(
        clampSolid3DWindowRect(
          { ...current, left: size.width - 1136, width: 1120 },
          size,
        ),
      );
    }
    setExpanded(!expanded);
  };

  const startWindowGesture = (
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: GestureKind,
  ) => {
    if (event.button !== 0 || isFullscreenLayout()) return;
    const rect = windowRect ?? currentRect();
    if (rect === null) return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = {
      kind,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      rect,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveWindowGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const size = workspaceSize();
    if (size === null) return;
    const dx = event.clientX - gesture.clientX;
    const dy = event.clientY - gesture.clientY;
    setWindowRect(
      clampSolid3DWindowRect(
        gesture.kind === "move"
          ? {
              ...gesture.rect,
              left: gesture.rect.left + dx,
              top: gesture.rect.top + dy,
            }
          : {
              ...gesture.rect,
              width: gesture.rect.width + dx,
              height: gesture.rect.height + dy,
            },
        size,
      ),
    );
  };

  const endWindowGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleWindowArrow = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    kind: GestureKind,
  ) => {
    if (isFullscreenLayout()) return;
    const direction: Record<string, readonly [number, number]> = {
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
    };
    const vector = direction[event.key];
    const size = workspaceSize();
    if (vector === undefined || size === null) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 32 : 10;
    const current =
      windowRect ?? currentRect() ?? initialSolid3DWindowRect(size);
    setWindowRect(
      clampSolid3DWindowRect(
        kind === "move"
          ? {
              ...current,
              left: current.left + vector[0] * step,
              top: current.top + vector[1] * step,
            }
          : {
              ...current,
              width: current.width + vector[0] * step,
              height: current.height + vector[1] * step,
            },
        size,
      ),
    );
  };

  return {
    dockRef,
    windowRect,
    expanded,
    toggleExpanded,
    startWindowGesture,
    moveWindowGesture,
    endWindowGesture,
    handleWindowArrow,
  };
}
