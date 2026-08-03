from pathlib import Path

path = Path("src/adapters/canvas-konva/BoardStage.tsx")
source = path.read_text(encoding="utf-8")

import_before = '''  type ReactElement,
} from "react";
'''
import_after = '''  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
'''
if import_before in source:
    source = source.replace(import_before, import_after, 1)
elif import_after not in source:
    raise SystemExit("Unexpected React type import block")

sample_block = '''  const selectionWorldSample = useCallback(
    (event: PointerEvent, session: SelectionSession): WorldPointerSample => ({
      point: screenToWorld(
        elementPoint(event, session.captureElement),
        session.viewport,
      ),
      pointerId: event.pointerId,
      pressure: 0,
    }),
    [],
  );
'''
begin_block = '''

  const beginSelectionSession = useCallback(
    (
      event: PointerEvent,
      captureElement: HTMLElement,
      objectId: BoardObjectId | null,
    ) => {
      captureElement.setPointerCapture(event.pointerId);
      const session: SelectionSession = {
        captureElement,
        pointerId: event.pointerId,
        viewport: previewViewport,
      };
      selectionSessionRef.current = session;
      setIsSelecting(true);
      selectionPointerCallbacksRef.current.start({
        ...selectionWorldSample(event, session),
        additive: event.shiftKey,
        areaOperation: event.altKey
          ? "subtract"
          : event.shiftKey
            ? "add"
            : "replace",
        objectId,
      });
    },
    [previewViewport, selectionWorldSample],
  );
'''
if begin_block.strip() not in source:
    if source.count(sample_block) != 1:
        raise SystemExit("Unexpected selectionWorldSample block")
    source = source.replace(sample_block, sample_block + begin_block, 1)

marker = '''  const handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
'''
fallback = '''  const handleSelectionBackgroundPointerDownCapture = (
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
if fallback.strip() not in source:
    if source.count(marker) != 1:
        raise SystemExit("Unexpected handlePointerDown marker")
    source = source.replace(marker, fallback + marker, 1)

old_branch = '''      captureElement.setPointerCapture(event.evt.pointerId);
      if (selectionModeKey !== null || hitObjectId !== null) {
        const session: SelectionSession = {
          captureElement,
          pointerId: event.evt.pointerId,
          viewport: previewViewport,
        };
        selectionSessionRef.current = session;
        setIsSelecting(true);
        selectionPointerCallbacksRef.current.start({
          ...selectionWorldSample(event.evt, session),
          additive: event.evt.shiftKey,
          areaOperation: event.evt.altKey
            ? "subtract"
            : event.evt.shiftKey
              ? "add"
              : "replace",
          objectId: hitObjectId,
        });
        return;
      }
'''
new_branch = '''      if (selectionModeKey !== null || hitObjectId !== null) {
        beginSelectionSession(event.evt, captureElement, hitObjectId);
        return;
      }
      captureElement.setPointerCapture(event.evt.pointerId);
'''
if old_branch in source:
    source = source.replace(old_branch, new_branch, 1)
elif new_branch not in source:
    raise SystemExit("Unexpected selection session branch")

root_before = '''    <div
      ref={rootRef}
      aria-label="Бесконечное полотно TutorBoard"
'''
root_after = '''    <div
      ref={rootRef}
      aria-label="Бесконечное полотно TutorBoard"
      onPointerDownCapture={handleSelectionBackgroundPointerDownCapture}
'''
if root_before in source:
    source = source.replace(root_before, root_after, 1)
elif root_after not in source:
    raise SystemExit("Unexpected board-stage root")

path.write_text(source, encoding="utf-8")
