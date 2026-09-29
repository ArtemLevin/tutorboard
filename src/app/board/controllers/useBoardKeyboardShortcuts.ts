import { useEffect } from "react";

import {
  drawingTools,
  isDrawingToolId,
  type DrawingToolId,
} from "../../../modules/drawing/public";
import { eraserToolId } from "../../../modules/eraser/public";
import { handwrittenFunctionToolId } from "../../../modules/handwritten-function/public";
import {
  lassoSelectionToolId,
  selectionToolId,
} from "../../../modules/selection/public";
import { primaryStyleColor } from "../../board-chrome/color-presets";
import type { ActiveToolId } from "../active-tool";
import { laserToolId, navigationToolId } from "../active-tool";
import {
  resolveBoardShortcut,
  type BoardShortcutAction,
} from "../shortcuts/board-shortcuts";
import type { BoardClipboardController } from "./useBoardClipboardController";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardDrawingController } from "./useBoardDrawingController";
import type { BoardHandwritingController } from "./useBoardHandwritingController";
import type { BoardInteractionRouter } from "./useBoardInteractionRouter";
import type { BoardSelectionController } from "./useBoardSelectionController";
import type { CoordinatePlotController } from "./useCoordinatePlotController";

const drawingActionByShortcut: Partial<
  Record<BoardShortcutAction, DrawingToolId>
> = {
  "tool.pen": "drawing.pen",
  "tool.smart-ink": "drawing.smart-ink",
  "tool.line": "drawing.line",
  "tool.rectangle": "drawing.rectangle",
  "tool.ellipse": "drawing.ellipse",
  "tool.polygon": "drawing.polygon",
  "tool.text": "drawing.text",
};

export interface UseBoardKeyboardShortcutsOptions {
  readonly activeTool: ActiveToolId;
  readonly clipboard: BoardClipboardController;
  readonly closeGeometry: () => void;
  readonly closeInspector: () => void;
  readonly closeSettings: () => void;
  readonly closeShortcuts: () => void;
  readonly documentController: BoardDocumentController;
  readonly drawing: BoardDrawingController;
  readonly geometryOpen: boolean;
  readonly handwriting: BoardHandwritingController;
  readonly handwrittenFunctionsEnabled: boolean;
  readonly interaction: BoardInteractionRouter;
  readonly openShortcuts: () => void;
  readonly plots: CoordinatePlotController;
  readonly readOnly: boolean;
  readonly selection: BoardSelectionController;
  readonly selectionInspectorOpen: boolean;
  readonly settingsOpen: boolean;
  readonly shortcutsOpen: boolean;
}

function isEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useBoardKeyboardShortcuts({
  activeTool,
  clipboard,
  closeGeometry,
  closeInspector,
  closeSettings,
  closeShortcuts,
  documentController,
  drawing,
  geometryOpen,
  handwriting,
  handwrittenFunctionsEnabled,
  interaction,
  openShortcuts,
  plots,
  readOnly,
  selection,
  selectionInspectorOpen,
  settingsOpen,
  shortcutsOpen,
}: UseBoardKeyboardShortcutsOptions): void {
  const { redo, undo } = documentController;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const editing = isEditingTarget(event.target);
      if (event.key === "Escape" && shortcutsOpen) {
        event.preventDefault();
        closeShortcuts();
        return;
      }
      if (event.key === "Escape" && settingsOpen) {
        event.preventDefault();
        closeSettings();
        return;
      }
      if (event.key === "Escape" && geometryOpen) {
        event.preventDefault();
        closeGeometry();
        return;
      }
      if (event.key === "Escape" && selectionInspectorOpen) {
        event.preventDefault();
        closeInspector();
        return;
      }
      if (
        event.key === "Escape" &&
        selection.getState().interaction.kind !== "idle"
      ) {
        event.preventDefault();
        selection.cancel();
        interaction.activate(navigationToolId);
        return;
      }
      if (
        event.key === "Escape" &&
        (activeTool === handwrittenFunctionToolId ||
          handwriting.state.kind !== "idle")
      ) {
        event.preventDefault();
        interaction.activate(navigationToolId);
        return;
      }
      if (event.key === "Escape" && plots.editor !== null) return;

      const accelerator = event.ctrlKey || event.metaKey;
      if (accelerator && !event.altKey && !editing) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          if (key === "y" || (key === "z" && event.shiftKey)) redo();
          else undo();
          return;
        }
        if (key === "c") {
          event.preventDefault();
          clipboard.copy();
          return;
        }
        if (key === "x") {
          event.preventDefault();
          clipboard.cut();
          return;
        }
        if (key === "v") return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || editing) return;

      if (event.key === "?") {
        event.preventDefault();
        openShortcuts();
        return;
      }

      const arrowDelta = {
        ArrowDown: { x: 0, y: event.shiftKey ? 10 : 1 },
        ArrowLeft: { x: event.shiftKey ? -10 : -1, y: 0 },
        ArrowRight: { x: event.shiftKey ? 10 : 1, y: 0 },
        ArrowUp: { x: 0, y: event.shiftKey ? -10 : -1 },
      }[event.key];
      if (
        arrowDelta !== undefined &&
        selection.getState().selectedObjectIds.length > 0 &&
        selection.getState().interaction.kind === "idle" &&
        !selection.selectedLocked
      ) {
        event.preventDefault();
        selection.moveBy(arrowDelta);
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selection.getState().selectedObjectIds.length > 0 &&
        selection.getState().interaction.kind === "idle"
      ) {
        event.preventDefault();
        selection.remove();
        return;
      }

      const action = resolveBoardShortcut(event, { readOnly });
      if (action === null) return;

      const drawingAction = drawingActionByShortcut[action];
      if (drawingAction !== undefined) {
        if (!drawingTools.some(({ id }) => id === drawingAction)) return;
        event.preventDefault();
        interaction.activate(drawingAction);
        return;
      }

      if (action.startsWith("color.")) {
        if (!isDrawingToolId(activeTool)) return;
        const index = Number(action.slice("color.".length)) - 1;
        const color = primaryStyleColor(index);
        if (color === null) return;
        event.preventDefault();
        drawing.updateStyle(
          activeTool,
          activeTool === "drawing.text" ? { fill: color } : { stroke: color },
        );
        return;
      }

      event.preventDefault();
      switch (action) {
        case "tool.pan":
          interaction.activate(navigationToolId);
          return;
        case "tool.select":
          interaction.activate(selectionToolId);
          return;
        case "tool.lasso":
          interaction.activate(lassoSelectionToolId);
          return;
        case "tool.eraser":
          interaction.activate(eraserToolId);
          return;
        case "tool.handwritten-function":
          if (handwrittenFunctionsEnabled && !readOnly) {
            interaction.activate(handwrittenFunctionToolId);
          }
          return;
        case "tool.laser":
          interaction.activate(laserToolId);
          return;
        case "plot.create":
          plots.create();
          return;
        case "tool.pen":
        case "tool.smart-ink":
        case "tool.line":
        case "tool.rectangle":
        case "tool.ellipse":
        case "tool.polygon":
        case "tool.text":
        case "color.1":
        case "color.2":
        case "color.3":
        case "color.4":
        case "color.5":
          return;
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    activeTool,
    clipboard,
    closeGeometry,
    closeInspector,
    closeSettings,
    closeShortcuts,
    drawing,
    geometryOpen,
    handwriting.state.kind,
    handwrittenFunctionsEnabled,
    interaction,
    openShortcuts,
    plots,
    readOnly,
    redo,
    selection,
    selectionInspectorOpen,
    settingsOpen,
    shortcutsOpen,
    undo,
  ]);
}
