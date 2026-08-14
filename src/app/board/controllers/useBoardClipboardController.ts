import { useCallback, useState } from "react";

import {
  boardObjectId,
  commandId,
  geometryImportId,
  groupId,
  solid3DId,
  type ActorId,
  type BoardObjectId,
} from "../../../core/public";
import {
  copyBoardSelection,
  createCutContentCommand,
  createPasteContentCommand,
  type BoardClipboardPayload,
} from "../../../modules/clipboard/public";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardSelectionController } from "./useBoardSelectionController";

export interface UseBoardClipboardControllerOptions {
  readonly actorId: ActorId;
  readonly documentController: BoardDocumentController;
  readonly onPasted: (objectIds: readonly BoardObjectId[]) => void;
  readonly selection: BoardSelectionController;
}

export function useBoardClipboardController({
  actorId,
  documentController,
  onPasted,
  selection,
}: UseBoardClipboardControllerOptions) {
  const { commitCommand, createCommandMetadata, getDocument } =
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

  const clearAll = useCallback(() => {
    const current = getDocument();
    const copied = copyBoardSelection(current, current.order);
    if (copied.status === "error") {
      return { count: 0, ok: true as const };
    }
    const result = commitCommand(
      createCutContentCommand(copied.payload, createCommandMetadata()),
    );
    if (!result.ok) {
      setNotice(result.error.message);
      return { error: result.error.message, ok: false as const };
    }
    selection.replaceSelection([]);
    return { count: copied.payload.order.length, ok: true as const };
  }, [commitCommand, createCommandMetadata, getDocument, selection]);

  const paste = useCallback(() => {
    if (payload === null) {
      setNotice("Буфер обмена пуст");
      return false;
    }
    const token = crypto.randomUUID();
    let objectSequence = 0;
    let groupSequence = 0;
    let importSequence = 0;
    let solidSequence = 0;
    const command = createPasteContentCommand(
      payload,
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
    setNotice(`Вставлено: ${command.objects.length}`);
    return true;
  }, [actorId, commitCommand, onPasted, payload]);

  return {
    clearAll,
    copy,
    cut,
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
