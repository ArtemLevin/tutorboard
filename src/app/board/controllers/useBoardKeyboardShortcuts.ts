import { useEffect } from "react";

import { drawingTools } from "../../../modules/drawing/public";
import { handwrittenFunctionToolId } from "../../../modules/handwritten-function/public";
import {
  lassoSelectionTool,
  lassoSelectionToolId,
  selectionTool,
  selectionToolId,
} from "../../../modules/selection/public";
import type { ActiveToolId } from "../active-tool";
import { laserToolId, navigationToolId } from "../active-tool";
import type { BoardClipboardController } from "./useBoardClipboardController";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardHandwritingController } from "./useBoardHandwritingController";
import type { BoardInteractionRouter } from "./useBoardInteractionRouter";
import type { BoardSelectionController } from "./useBoardSelectionController";
import type { CoordinatePlotController } from "./useCoordinatePlotController";

export interface UseBoardKeyboardShortcutsOptions {
  readonly activeTool: ActiveToolId;
  readonly clipboard: BoardClipboardController;
  readonly closeGeometry: () => void;
  readonly closeInspector: () => void;
  readonly closeSettings: () => void;
  readonly closeShortcuts: () => void;
  readonly documentController: BoardDocumentController;
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
      if (event.key.toLowerCase() === "h") {
        interaction.activate(navigationToolId);
        return;
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        plots.create();
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        interaction.activate(laserToolId);
        return;
      }
      if (
        event.key.toLowerCase() === "f" &&
        handwrittenFunctionsEnabled &&
        !readOnly
      ) {
        event.preventDefault();
        interaction.activate(handwrittenFunctionToolId);
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
        event.key.toLowerCase() === lassoSelectionTool.shortcut.toLowerCase()
      ) {
        interaction.activate(lassoSelectionToolId);
        return;
      }
      if (event.key.toLowerCase() === selectionTool.shortcut.toLowerCase()) {
        interaction.activate(selectionToolId);
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
      const tool = drawingTools.find(
        (candidate) =>
          candidate.shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (tool !== undefined) interaction.activate(tool.id);
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
