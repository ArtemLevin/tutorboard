import { useCallback, useState } from "react";

import {
  boardObjectId,
  commandId,
  geometryImportId,
  groupId,
  solid3DId,
  type ActorId,
  type BoardCommand,
  type BoardDocument,
  type BoardObjectId,
} from "../../../core/public";
import {
  copyBoardSelection,
  createCutContentCommand,
  createPasteContentCommand,
  type BoardClipboardPayload,
} from "../../../modules/clipboard/public";
import { selectionIsLocked } from "../../../modules/selection/public";
import {
  maximumBoardCommandJsonBytes,
  serializeBoardCommand,
} from "../../../core/board/commands/codec/public";
import {
  createFullBoardCut,
  planAtomicFullBoardClear,
} from "../atomic-clear-plan";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardSelectionController } from "./useBoardSelectionController";

export interface UseBoardClipboardControllerOptions {
  readonly actorId: ActorId;
  readonly documentController: BoardDocumentController;
  readonly onPasted: (objectIds: readonly BoardObjectId[]) => void;
  readonly selection: BoardSelectionController;
  readonly sharedBoard?: boolean;
  readonly canRestoreClear?: (
    command: BoardCommand,
    source: BoardDocument,
  ) => boolean;
}

export function useBoardClipboardController({
  actorId,
  documentController,
  onPasted,
  selection,
  sharedBoard = false,
  canRestoreClear,
}: UseBoardClipboardControllerOptions) {
  const { commitCommand, commitCommands, createCommandMetadata, getDocument } =
    documentController;
  const [payload, setPayload] = useState<BoardClipboardPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = useCallback(() => {
    const copied = copyBoardSelection(
      getDocument(),
      selection.getState().selectedObjectIds,
    );
    if (copied.status === "error") {
      setNotice("Нет объектов для копирования");
      return false;
    }
    setPayload(copied.payload);
    setNotice(`Скопировано: ${copied.payload.order.length}`);
    return true;
  }, [getDocument, selection]);

  const cut = useCallback(() => {
    const current = getDocument();
    const copied = copyBoardSelection(
      current,
      selection.getState().selectedObjectIds,
    );
    if (copied.status === "error") {
      setNotice("Нет объектов для вырезания");
      return false;
    }
    const result = commitCommand(
      createCutContentCommand(copied.payload, createCommandMetadata()),
    );
    if (!result.ok) {
      setNotice(result.error.message);
      return false;
    }
    setPayload(copied.payload);
    setNotice(`Вырезано: ${copied.payload.order.length}`);
    selection.replaceSelection([]);
    return true;
  }, [commitCommand, createCommandMetadata, getDocument, selection]);

  const clearAll = useCallback(
    (options: { readonly discardUndoHistory?: boolean } = {}) => {
      const current = getDocument();
      if (current.order.length === 0) {
        return { count: 0, ok: true as const };
      }
      const full = options.discardUndoHistory === true;
      const fail = (message: string) => {
        setNotice(message);
        return { error: message, ok: false as const };
      };
      const commands =
        sharedBoard && full
          ? planAtomicFullBoardClear(current, createCommandMetadata)
          : [createFullBoardCut(current, createCommandMetadata())];
      if (commands === null || commands.length === 0) {
        return fail(
          "Очистка превышает лимит атомарной синхронизации. Доска сохранена без изменений.",
        );
      }
      if (sharedBoard && !full) {
        const command = commands[0]!;
        const encoded = serializeBoardCommand(command);
        if (
          !encoded.ok ||
          new TextEncoder().encode(encoded.json).byteLength >
            maximumBoardCommandJsonBytes
        ) {
          return fail(
            "Обратимая очистка превышает лимит передачи. Доска сохранена без изменений.",
          );
        }
        if (canRestoreClear?.(command, current) !== true) {
          return fail(
            "Невозможно гарантировать Undo для этой очистки. Выберите полный сброс.",
          );
        }
      }
      const result =
        commands.length === 1
          ? commitCommand(commands[0]!, { discardUndoHistory: full })
          : commitCommands(commands, { discardUndoHistory: full });
      if (!result.ok) return fail(result.error.message);
      selection.replaceSelection([]);
      return { count: current.order.length, ok: true as const };
    },
    [
      canRestoreClear,
      commitCommand,
      commitCommands,
      createCommandMetadata,
      getDocument,
      selection,
      sharedBoard,
    ],
  );

  const insertPayload = useCallback(
    (source: BoardClipboardPayload, action: "Вставлено" | "Дублировано") => {
      const token = crypto.randomUUID();
      let objectSequence = 0;
      let groupSequence = 0;
      let importSequence = 0;
      let solidSequence = 0;
      const command = createPasteContentCommand(
        source,
        {
          actorId,
          id: commandId(`command:${token}`),
          timestamp: new Date().toISOString(),
        },
        {
          geometryImport: () =>
            geometryImportId(`import:paste:${token}:${importSequence++}`),
          group: () => groupId(`group:paste:${token}:${groupSequence++}`),
          object: () =>
            boardObjectId(`object:paste:${token}:${objectSequence++}`),
          solid3D: () => solid3DId(`solid:paste:${token}:${solidSequence++}`),
        },
      );
      const result = commitCommand(command);
      if (!result.ok) {
        setNotice(result.error.message);
        return false;
      }
      onPasted(command.objects.map(({ id }) => id));
      setNotice(`${action}: ${command.objects.length}`);
      return true;
    },
    [actorId, commitCommand, onPasted],
  );

  const paste = useCallback(() => {
    if (payload === null) {
      setNotice("Буфер обмена пуст");
      return false;
    }
    return insertPayload(payload, "Вставлено");
  }, [insertPayload, payload]);

  const duplicate = useCallback(() => {
    const current = getDocument();
    const selected = selection.getState();
    if (
      selected.interaction.kind !== "idle" ||
      selected.selectedObjectIds.length === 0 ||
      selectionIsLocked(current, selected.selectedObjectIds)
    ) {
      setNotice("Выделение недоступно для дублирования");
      return false;
    }
    const copied = copyBoardSelection(current, selected.selectedObjectIds);
    if (copied.status === "error") return false;
    return insertPayload(copied.payload, "Дублировано");
  }, [getDocument, insertPayload, selection]);

  const discardClipboard = useCallback(() => {
    setPayload(null);
    setNotice(null);
  }, []);

  return {
    clearAll,
    discardClipboard,
    copy,
    cut,
    duplicate,
    hasContent: payload !== null,
    notice,
    paste,
    payload,
    setNotice,
  } as const;
}

export type BoardClipboardController = ReturnType<
  typeof useBoardClipboardController
>;
