import { useCallback, useEffect, useRef, useState } from "react";

import {
  boardObjectId,
  type BoardObject,
  type BoardObjectId,
  type Size2,
  type Vec2,
} from "../../../core/public";
import {
  createEmbeddedImageObject,
  embeddedImageAccept,
  embeddedImageImportLimits,
  isSupportedEmbeddedImageCandidate,
  prepareEmbeddedImageFile,
} from "../../image-import";
import {
  createMediaAssetObject,
  isRasterAssetCandidate,
  prepareRasterAssetFile,
  rasterAssetImportLimits,
  uploadBeforeCommand,
  type BoardMediaUploadSession,
} from "../../media-asset-import";
import type { BoardClipboardController } from "./useBoardClipboardController";
import type { BoardDocumentController } from "./useBoardDocumentController";

export interface UseBoardMediaControllerOptions {
  readonly assetImportEnabled?: boolean | undefined;
  readonly assetUpload?: BoardMediaUploadSession | undefined;
  readonly clipboard: BoardClipboardController;
  readonly documentController: BoardDocumentController;
  readonly onImagesInserted: (objectIds: readonly BoardObjectId[]) => void;
  readonly readOnly?: boolean | undefined;
  readonly resolveImageDisplaySize?: ((intrinsicSize: Size2) => Size2) | undefined;
  readonly resolvePlacementCenter: () => Vec2;
}

export function useBoardMediaController({
  assetImportEnabled = false,
  assetUpload,
  clipboard,
  documentController,
  onImagesInserted,
  readOnly = false,
  resolveImageDisplaySize,
  resolvePlacementCenter,
}: UseBoardMediaControllerOptions) {
  const { commitCommand, createCommandMetadata, getDocument } = documentController;
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const activeImportRef = useRef<AbortController | null>(null);

  // Abort in-flight uploads if the transport, board authority or component changes.
  useEffect(() => () => activeImportRef.current?.abort(), [
    assetUpload, assetImportEnabled, readOnly,
  ]);

  const importFiles = useCallback(
    async (files: readonly File[]) => {
      if (readOnly) return;
      if (activeImportRef.current !== null) {
        setDiagnostic("Дождитесь завершения текущей загрузки изображений.");
        return;
      }
      const candidates = files
        .filter(isSupportedEmbeddedImageCandidate)
        .slice(0, embeddedImageImportLimits.maxFilesPerBatch);
      if (candidates.length === 0) {
        setDiagnostic("image.unsupported-format: Поддерживаются PNG, JPEG/JPG, SVG и GIF.");
        return;
      }
      const maxBatchBytes = assetImportEnabled
        ? rasterAssetImportLimits.maxBatchBytes
        : embeddedImageImportLimits.maxBatchBytes;
      if (candidates.reduce((sum, file) => sum + file.size, 0) > maxBatchBytes) {
        setDiagnostic(assetImportEnabled
          ? "Общий размер вставки превышает 96 МБ."
          : "image.batch-too-large: Общий размер вставки превышает 24 МБ.");
        return;
      }

      const operation = new AbortController();
      activeImportRef.current = operation;
      setUploading(true);
      setDiagnostic(null);
      const initialDocumentId = getDocument().id;
      const center = resolvePlacementCenter();
      const objects: BoardObject[] = [];
      const diagnostics: string[] = [];
      if (assetImportEnabled) clipboard.setNotice("Загружаем изображения…");
      try {
        for (const [index, file] of candidates.entries()) {
          if (operation.signal.aborted || readOnly || getDocument().id !== initialDocumentId) return;
          const point = { x: center.x + index * 24, y: center.y + index * 24 };
          const id = boardObjectId(`object:${crypto.randomUUID()}`);
          if (assetImportEnabled && isRasterAssetCandidate(file)) {
            if (assetUpload === undefined || !assetUpload.isCurrent() || assetUpload.documentId !== initialDocumentId) {
              diagnostics.push(`${file.name}: требуется активное подключение к доске с правами записи`);
              continue;
            }
            const prepared = await prepareRasterAssetFile(file);
            if (operation.signal.aborted || !assetUpload.isCurrent()) return;
            if (prepared.status === "error") {
              diagnostics.push(`${file.name}: ${prepared.code}`);
              continue;
            }
            const uploaded = await uploadBeforeCommand(prepared.value, assetUpload, operation.signal);
            if (uploaded.status === "cancelled") return;
            if (uploaded.status === "error") {
              diagnostics.push(`${file.name}: ${uploaded.message}`);
              continue;
            }
            const displaySize = resolveImageDisplaySize?.(uploaded.descriptor.intrinsicSize);
            objects.push(createMediaAssetObject({
              center: point,
              descriptor: uploaded.descriptor,
              ...(displaySize === undefined ? {} : { displaySize }),
              id,
            }));
            continue;
          }
          const prepared = await prepareEmbeddedImageFile(file);
          if (operation.signal.aborted) return;
          if (prepared.status === "error") {
            diagnostics.push(`${file.name}: ${prepared.code}`);
            continue;
          }
          const displaySize = resolveImageDisplaySize?.(prepared.value.intrinsicSize);
          objects.push(createEmbeddedImageObject({
            center: point,
            ...(displaySize === undefined ? {} : { displaySize }),
            id,
            prepared: prepared.value,
          }));
        }
        if (operation.signal.aborted || readOnly || getDocument().id !== initialDocumentId) return;
        if (assetImportEnabled && assetUpload !== undefined && !assetUpload.isCurrent()) return;
        if (objects.length === 0) {
          setDiagnostic(diagnostics.length > 0
            ? `Изображения отклонены: ${diagnostics.join("; ")}`
            : "Не удалось подготовить изображения.");
          clipboard.setNotice(null);
          return;
        }
        const result = commitCommand({
          ...createCommandMetadata(),
          kind: "core.objects.add",
          objects,
        });
        if (!result.ok) {
          setDiagnostic(result.error.message);
          clipboard.setNotice(null);
          return;
        }
        onImagesInserted(objects.map(({ id }) => id));
        clipboard.setNotice(`Вставлено изображений: ${objects.length}`);
        setDiagnostic(diagnostics.length === 0
          ? null
          : `Часть файлов пропущена: ${diagnostics.join("; ")}`);
      } finally {
        if (activeImportRef.current === operation) {
          activeImportRef.current = null;
          setUploading(false);
        }
      }
    },
    [
      assetImportEnabled, assetUpload, clipboard, commitCommand,
      createCommandMetadata, getDocument, onImagesInserted, readOnly,
      resolveImageDisplaySize, resolvePlacementCenter,
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
    assetImportEnabled,
    diagnostic,
    importFiles,
    uploading,
  } as const;
}

export type BoardMediaController = ReturnType<typeof useBoardMediaController>;
