from pathlib import Path

path = Path("src/adapters/canvas-konva/BoardStage.tsx")
source = path.read_text(encoding="utf-8")

source = source.replace("  type PointerEvent as ReactPointerEvent,\n", "", 1)

old_handler = '''  const handleSelectionBackgroundPointerDownCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      event.button !== 0 ||
      selectionModeKey === null ||
      panSessionRef.current !== null ||
      drawingSessionRef.current !== null ||
      selectionSessionRef.current !== null
    ) {
      return;
    }
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }
    const container = stage.container();
    const bounds = container.getBoundingClientRect();
    const hit = stage.getIntersection({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    if (hit !== null && objectIdFromTarget(hit) !== null) {
      return;
    }
    commitWheel();
    event.preventDefault();
    beginSelectionSession(event.nativeEvent, event.currentTarget, null);
  };

'''
new_handler = '''  const handleSelectionBackgroundPointerDownCapture = useCallback(
    (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        spacePressedRef.current ||
        selectionModeKey === null ||
        panSessionRef.current !== null ||
        drawingSessionRef.current !== null ||
        selectionSessionRef.current !== null
      ) {
        return;
      }
      const stage = stageRef.current;
      const root = rootRef.current;
      if (stage === null || root === null) {
        return;
      }
      const container = stage.container();
      const bounds = container.getBoundingClientRect();
      const hit = stage.getIntersection({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      if (
        hit !== null &&
        ((transformableObjectIds.length > 0 && isTransformerTarget(hit)) ||
          objectIdFromTarget(hit) !== null)
      ) {
        return;
      }
      commitWheel();
      event.preventDefault();
      beginSelectionSession(event, root, null);
    },
    [
      beginSelectionSession,
      commitWheel,
      selectionModeKey,
      transformableObjectIds.length,
    ],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    root.addEventListener(
      "pointerdown",
      handleSelectionBackgroundPointerDownCapture,
      true,
    );
    return () => {
      root.removeEventListener(
        "pointerdown",
        handleSelectionBackgroundPointerDownCapture,
        true,
      );
    };
  }, [handleSelectionBackgroundPointerDownCapture]);

'''
if old_handler in source:
    source = source.replace(old_handler, new_handler, 1)
elif new_handler not in source:
    raise SystemExit("Unexpected background selection handler")

source = source.replace(
    '      onPointerDownCapture={handleSelectionBackgroundPointerDownCapture}\n',
    "",
    1,
)

old_transformer_guard = '''    if (
      !isRightButton &&
      isTransformerTarget(event.target) &&
      !isLassoAreaModifier
    ) {
'''
new_transformer_guard = '''    if (
      !isRightButton &&
      transformableObjectIds.length > 0 &&
      isTransformerTarget(event.target) &&
      !isLassoAreaModifier
    ) {
'''
if old_transformer_guard in source:
    source = source.replace(old_transformer_guard, new_transformer_guard, 1)
elif new_transformer_guard not in source:
    raise SystemExit("Unexpected Transformer pointer guard")

path.write_text(source, encoding="utf-8")
