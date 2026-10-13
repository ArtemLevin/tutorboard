import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  commandId,
  createPreparedViewportReducer,
  measureBoardFrameTrace,
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
  readonly onCommandsCommitted?:
    | ((
        commands: readonly BoardCommand[],
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
  onCommandsCommitted,
  onDocumentChange,
  readOnly,
}: UseBoardDocumentControllerOptions) {
  const viewportReducer = useMemo(() => createPreparedViewportReducer(), []);
  const [state, setState] = useState(() => ({
    commandError: null as string | null,
    history: createDocumentHistory(viewportReducer.prepare(initialDocument)),
  }));
  const document = state.history.present;
  const documentRef = useRef(document);
  const externalDocumentRef = useRef(initialDocument);
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
    // The internal graph is a deep immutable copy. The incoming prop's
    // identity is the hydration boundary, never its equality to the copy.
    if (externalDocumentRef.current === initialDocument) return;
    externalDocumentRef.current = initialDocument;
    viewportReducer.reset();
    const prepared = viewportReducer.prepare(initialDocument);
    documentRef.current = prepared;
    setState((current) =>
      current.history.present === prepared
        ? current
        : {
            commandError: null,
            history: createDocumentHistory(prepared),
          },
    );
  }, [initialDocument, viewportReducer]);

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
      const isViewport = command.kind === "core.viewport.set";
      if (!isViewport) viewportReducer.reset();
      const result = isViewport
        ? measureBoardFrameTrace("viewport-reducer-total", () =>
            viewportReducer.reduce(previousDocument, command),
          )
        : reduceBoardDocument(previousDocument, command);
      if (!result.ok) {
        setState((current) => ({
          ...current,
          commandError: result.error.message,
        }));
        return result;
      }
      documentRef.current = result.document;
      const scheduleHistory = () =>
        setState((current) => ({
          commandError: null,
          history: isViewport
            ? measureBoardFrameTrace("viewport-history", () =>
                commitDocumentHistory(current.history, result.document),
              )
            : commitDocumentHistory(current.history, result.document),
        }));
      if (isViewport) {
        measureBoardFrameTrace("viewport-controller-schedule", scheduleHistory);
        measureBoardFrameTrace("viewport-controller-callbacks", () =>
          onCommandCommitted?.(command, result.document, previousDocument),
        );
      } else {
        scheduleHistory();
        onCommandCommitted?.(command, result.document, previousDocument);
      }
      return result;
    },
    [
      effectiveMutationPolicy.canWrite,
      onCommandCommitted,
      rejectMutation,
      viewportReducer,
    ],
  );

  const commitCommands = useCallback(
    (commands: readonly BoardCommand[]): CommandResult => {
      if (!effectiveMutationPolicy.canWrite) {
        return rejectMutation();
      }
      const initialDocument = documentRef.current;
      if (commands.length === 0) {
        return { document: initialDocument, ok: true };
      }

      viewportReducer.reset();
      const transitions: {
        readonly command: BoardCommand;
        readonly document: BoardDocument;
        readonly previousDocument: BoardDocument;
      }[] = [];
      let currentDocument = initialDocument;
      for (const command of commands) {
        const result = reduceBoardDocument(currentDocument, command);
        if (!result.ok) {
          setState((current) => ({
            ...current,
            commandError: result.error.message,
          }));
          return { ...result, document: initialDocument };
        }
        transitions.push({
          command,
          document: result.document,
          previousDocument: currentDocument,
        });
        currentDocument = result.document;
      }

      documentRef.current = currentDocument;
      setState((current) => ({
        commandError: null,
        history: commitDocumentHistory(current.history, currentDocument),
      }));
      if (onCommandsCommitted !== undefined) {
        onCommandsCommitted(
          transitions.map(({ command }) => command),
          currentDocument,
          initialDocument,
        );
      } else {
        for (const transition of transitions) {
          onCommandCommitted?.(
            transition.command,
            transition.document,
            transition.previousDocument,
          );
        }
      }
      return { document: currentDocument, ok: true };
    },
    [
      effectiveMutationPolicy.canWrite,
      onCommandCommitted,
      onCommandsCommitted,
      rejectMutation,
      viewportReducer,
    ],
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
    viewportReducer.reset();
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
    viewportReducer,
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
    viewportReducer.reset();
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
    viewportReducer,
  ]);

  return {
    commandError: state.commandError,
    commitCommand,
    commitCommands,
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
