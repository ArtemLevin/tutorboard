import { useCallback, useEffect, useState } from "react";

import {
  boardObjectId,
  type BoardObjectId,
  type Vec2,
} from "../../../core/public";
import {
  createEmbeddedImageObject,
  embeddedImageAccept,
  embeddedImageImportLimits,
  isSupportedEmbeddedImageCandidate,
  prepareEmbeddedImageFile,
} from "../../image-import";
import type { BoardClipboardController } from "./useBoardClipboardController";
import type { BoardDocumentController } from "./useBoardDocumentController";

export interface UseBoardMediaControllerOptions {
  readonly clipboard: BoardClipboardController;
  readonly documentController: BoardDocumentController;
  readonly onImagesInserted: (objectIds: readonly BoardObjectId[]) => void;
  readonly resolvePlacementCenter: () => Vec2;
}

export function useBoardMediaController({
  clipboard,
  documentController,
  onImagesInserted,
  resolvePlacementCenter,
}: UseBoardMediaControllerOptions) {
  const { commitCommand, createCommandMetadata } = documentController;
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  const importFiles = useCallback(
    async (files: readonly File[]) => {
      const candidates = files
        .filter(isSupportedEmbeddedImageCandidate)
        .slice(0, embeddedImageImportLimits.maxFilesPerBatch);
      if (candidates.length === 0) {
        setDiagnostic(
          "image.unsupported-format: Поддерживаются PNG, JPEG/JPG, SVG и GIF.",
        );
        return;
      }
      const totalBytes = candidates.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > embeddedImageImportLimits.maxBatchBytes) {
        setDiagnostic(
          "image.batch-too-large: Общий размер вставки превышает 24 МБ.",
        );
        return;
      }

      const baseCenter = resolvePlacementCenter();
      const objects = [];
      const diagnostics: string[] = [];
      for (const [index, file] of candidates.entries()) {
        const prepared = await prepareEmbeddedImageFile(file);
        if (prepared.status === "error") {
          diagnostics.push(`${file.name}: ${prepared.code}`);
          continue;
        }
        objects.push(
          createEmbeddedImageObject({
            center: {
              x: baseCenter.x + index * 24,
              y: baseCenter.y + index * 24,
            },
            id: boardObjectId(`object:${crypto.randomUUID()}`),
            prepared: prepared.value,
          }),
        );
      }
      if (objects.length === 0) {
        setDiagnostic(
          diagnostics.length > 0
            ? `Изображения отклонены: ${diagnostics.join("; ")}`
            : "Не удалось подготовить изображения.",
        );
        return;
      }
      const result = commitCommand({
        ...createCommandMetadata(),
        kind: "core.objects.add",
        objects,
      });
      if (!result.ok) {
        setDiagnostic(result.error.message);
        return;
      }
      onImagesInserted(objects.map(({ id }) => id));
      clipboard.setNotice(`Вставлено изображений: ${objects.length}`);
      setDiagnostic(
        diagnostics.length === 0
          ? null
          : `Часть файлов пропущена: ${diagnostics.join("; ")}`,
      );
    },
    [
      clipboard,
      commitCommand,
      createCommandMetadata,
      onImagesInserted,
      resolvePlacementCenter,
    ],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const editing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
      if (editing) return;
      const files = [...(event.clipboardData?.items ?? [])].flatMap((item) => {
        if (item.kind !== "file") return [];
        const file = item.getAsFile();
        return file === null ? [] : [file];
      });
      const images = files.filter(isSupportedEmbeddedImageCandidate);
      event.preventDefault();
      if (images.length > 0) void importFiles(images);
      else clipboard.paste();
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [clipboard, importFiles]);

  return {
    accept: embeddedImageAccept,
    diagnostic,
    importFiles,
  } as const;
}

export type BoardMediaController = ReturnType<typeof useBoardMediaController>;
