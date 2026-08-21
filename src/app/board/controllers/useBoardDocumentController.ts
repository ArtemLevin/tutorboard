import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  boardMutationPolicyMessage,
  writableBoardMutationPolicy,
  type BoardMutationPolicy,
} from "../../../core/access/public";
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
  readonly mutationPolicy?: BoardMutationPolicy;
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
  mutationPolicy,
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
  const effectiveMutationPolicy = useMemo(
    () =>
      mutationPolicy ??
      (readOnly
        ? ({ canWrite: false, reason: "missing-board-write" } as const)
        : writableBoardMutationPolicy),
    [mutationPolicy, readOnly],
  );

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    onDocumentChange?.(document);
  }, [document, onDocumentChange]);

  useEffect(() => {
    if (documentRef.current === initialDocument) {
      return;
    }
    documentRef.current = initialDocument;
    setState((current) =>
      current.history.present === initialDocument
        ? current
        : {
            commandError: null,
            history: createDocumentHistory(initialDocument),
          },
    );
  }, [initialDocument]);

  const getDocument = useCallback(() => documentRef.current, []);

  const createCommandMetadata = useCallback(
    (): CommandMetadata => ({
      actorId: commandActorId,
      id: commandId(`command:${crypto.randomUUID()}`),
      timestamp: new Date().toISOString(),
    }),
    [commandActorId],
  );

  const rejectMutation = useCallback((): CommandResult => {
    const result: CommandResult = {
      document: documentRef.current,
      error: {
        code: "command.invalid",
        message: boardMutationPolicyMessage(effectiveMutationPolicy),
      },
      ok: false,
    };
    setState((current) => ({
      ...current,
      commandError: result.error.message,
    }));
    return result;
  }, [effectiveMutationPolicy]);

  const commitCommand = useCallback(
    (command: BoardCommand): CommandResult => {
      if (!effectiveMutationPolicy.canWrite) {
        return rejectMutation();
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
    [effectiveMutationPolicy.canWrite, onCommandCommitted, rejectMutation],
  );

  const setCommandError = useCallback((message: string | null) => {
    setState((current) => ({ ...current, commandError: message }));
  }, []);

  const rejectHistoryMutation = useCallback(() => {
    setCommandError(boardMutationPolicyMessage(effectiveMutationPolicy));
  }, [effectiveMutationPolicy, setCommandError]);

  const undo = useCallback(() => {
    if (!effectiveMutationPolicy.canWrite) {
      rejectHistoryMutation();
      return;
    }
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
    effectiveMutationPolicy.canWrite,
    historyEnabled,
    onCollaborativeUndo,
    rejectHistoryMutation,
    setCommandError,
  ]);

  const redo = useCallback(() => {
    if (!effectiveMutationPolicy.canWrite) {
      rejectHistoryMutation();
      return;
    }
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
  }, [
    effectiveMutationPolicy.canWrite,
    historyEnabled,
    rejectHistoryMutation,
    setCommandError,
  ]);

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
