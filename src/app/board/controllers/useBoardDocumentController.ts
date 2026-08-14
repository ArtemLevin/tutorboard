import { useCallback, useEffect, useRef, useState } from "react";

import {
  commandId,
  reduceBoardDocument,
  type ActorId,
  type BoardCommand,
  type BoardDocument,
  type CommandMetadata,
  type CommandResult,
} from "../../../core/public";
import {
  commitDocumentHistory,
  createDocumentHistory,
  redoDocumentHistory,
  undoDocumentHistory,
} from "../../../modules/history/public";

export interface UseBoardDocumentControllerOptions {
  readonly collaborativeUndoAvailable: boolean;
  readonly commandActorId: ActorId;
  readonly historyEnabled: boolean;
  readonly initialDocument: BoardDocument;
  readonly onCollaborativeUndo?: (() => void) | undefined;
  readonly onCommandCommitted?:
    | ((
        command: BoardCommand,
        document: BoardDocument,
        previousDocument: BoardDocument,
      ) => void)
    | undefined;
  readonly onDocumentChange?: ((document: BoardDocument) => void) | undefined;
  readonly readOnly: boolean;
}

export function useBoardDocumentController({
  collaborativeUndoAvailable,
  commandActorId,
  historyEnabled,
  initialDocument,
  onCollaborativeUndo,
  onCommandCommitted,
  onDocumentChange,
  readOnly,
}: UseBoardDocumentControllerOptions) {
  const [state, setState] = useState(() => ({
    commandError: null as string | null,
    history: createDocumentHistory(initialDocument),
  }));
  const document = state.history.present;
  const documentRef = useRef(document);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    onDocumentChange?.(document);
  }, [document, onDocumentChange]);

  const getDocument = useCallback(() => documentRef.current, []);

  const createCommandMetadata = useCallback(
    (): CommandMetadata => ({
      actorId: commandActorId,
      id: commandId(`command:${crypto.randomUUID()}`),
      timestamp: new Date().toISOString(),
    }),
    [commandActorId],
  );

  const commitCommand = useCallback(
    (command: BoardCommand): CommandResult => {
      if (readOnly) {
        const result: CommandResult = {
          document: documentRef.current,
          error: {
            code: "command.invalid",
            message: "Доска открыта только для чтения.",
          },
          ok: false,
        };
        setState((current) => ({
          ...current,
          commandError: result.error.message,
        }));
        return result;
      }
      const previousDocument = documentRef.current;
      const result = reduceBoardDocument(previousDocument, command);
      if (!result.ok) {
        setState((current) => ({
          ...current,
          commandError: result.error.message,
        }));
        return result;
      }
      documentRef.current = result.document;
      setState((current) => ({
        commandError: null,
        history: commitDocumentHistory(current.history, result.document),
      }));
      onCommandCommitted?.(command, result.document, previousDocument);
      return result;
    },
    [onCommandCommitted, readOnly],
  );

  const setCommandError = useCallback((message: string | null) => {
    setState((current) => ({ ...current, commandError: message }));
  }, []);

  const undo = useCallback(() => {
    if (!historyEnabled) {
      if (collaborativeUndoAvailable && onCollaborativeUndo !== undefined) {
        onCollaborativeUndo();
      } else {
        setCommandError("Нет собственной обратимой операции для отмены.");
      }
      return;
    }
    setState((current) => {
      const next = undoDocumentHistory(current.history);
      return next === current.history
        ? current
        : { commandError: null, history: next };
    });
  }, [
    collaborativeUndoAvailable,
    historyEnabled,
    onCollaborativeUndo,
    setCommandError,
  ]);

  const redo = useCallback(() => {
    if (!historyEnabled) {
      setCommandError(
        "Повтор будет доступен после добавления синхронизируемой undo-команды в board/v1.",
      );
      return;
    }
    setState((current) => {
      const next = redoDocumentHistory(current.history);
      return next === current.history
        ? current
        : { commandError: null, history: next };
    });
  }, [historyEnabled, setCommandError]);

  return {
    commandError: state.commandError,
    commitCommand,
    createCommandMetadata,
    document,
    getDocument,
    history: state.history,
    redo,
    setCommandError,
    undo,
  } as const;
}

export type BoardDocumentController = ReturnType<
  typeof useBoardDocumentController
>;
