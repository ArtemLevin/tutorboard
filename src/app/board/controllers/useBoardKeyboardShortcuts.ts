import { useEffect } from "react";

import { isDrawingToolId } from "../../../modules/drawing/public";
import { handwrittenFunctionToolId } from "../../../modules/handwritten-function/public";
import type { ActiveToolId } from "../active-tool";
import { navigationToolId } from "../active-tool";
import {
  resolveBoardShortcut,
  type BoardShortcutInput,
} from "../shortcuts/board-shortcuts";
import type { BoardClipboardController } from "./useBoardClipboardController";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardDrawingController } from "./useBoardDrawingController";
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

function shortcutInput(event: KeyboardEvent): BoardShortcutInput {
  return {
    altKey: event.altKey,
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    repeat: event.repeat,
    shiftKey: event.shiftKey,
  };
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

      const action = resolveBoardShortcut(shortcutInput(event), {
        handwrittenFunctionsEnabled,
        readOnly,
      });
      if (action === null) return;

      event.preventDefault();
      switch (action.kind) {
        case "activate-tool":
          interaction.activate(action.tool);
          return;
        case "create-plot":
          plots.create();
          return;
        case "set-primary-color":
          if (!isDrawingToolId(activeTool)) return;
          drawing.updateStyle(
            activeTool,
            activeTool === "drawing.text"
              ? { fill: action.color }
              : { stroke: action.color },
          );
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
