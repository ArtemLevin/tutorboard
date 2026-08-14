import type { ReactNode, RefObject } from "react";

import {
  boardDocumentSchemaVersion,
  type BoardDocument,
} from "../../../core/public";
import { selectionToolId } from "../../../modules/selection/public";
import { BoardSettingsDialog } from "../../board-chrome/BoardSettingsDialog";
import type { AppPersistenceStatus } from "../types";
import type { BoardClipboardController } from "../controllers/useBoardClipboardController";
import type { BoardInteractionRouter } from "../controllers/useBoardInteractionRouter";
import type { BoardSelectionController } from "../controllers/useBoardSelectionController";

export interface BoardSettingsPanelProps {
  readonly clipboard: BoardClipboardController;
  readonly developmentDiagnostics: boolean;
  readonly document: BoardDocument;
  readonly interaction: BoardInteractionRouter;
  readonly onClose: () => void;
  readonly onExportDiagnostics?: (() => void) | undefined;
  readonly onExportDocument?: ((document: BoardDocument) => void) | undefined;
  readonly onExportPdfSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportPngSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onExportSvgSnapshot?:
    ((document: BoardDocument) => void) | undefined;
  readonly onImportDocument?: ((file: File) => void) | undefined;
  readonly onOpenShortcuts: () => void;
  readonly onResetViewport: () => void;
  readonly onShareBoard?: (() => void) | undefined;
  readonly open: boolean;
  readonly persistenceStatus: AppPersistenceStatus;
  readonly selection: BoardSelectionController;
  readonly settingsExtra?: ReactNode;
  readonly shortcutsButtonRef: RefObject<HTMLButtonElement | null>;
  readonly shortcutsOpen: boolean;
  readonly stage: string;
}

export function BoardSettingsPanel({
  clipboard,
  developmentDiagnostics,
  document,
  interaction,
  onClose,
  onExportDiagnostics,
  onExportDocument,
  onExportPdfSnapshot,
  onExportPngSnapshot,
  onExportSvgSnapshot,
  onImportDocument,
  onOpenShortcuts,
  onResetViewport,
  onShareBoard,
  open,
  persistenceStatus,
  selection,
  settingsExtra,
  shortcutsButtonRef,
  shortcutsOpen,
  stage,
}: BoardSettingsPanelProps) {
  return (
    <BoardSettingsDialog
      onClose={onClose}
      open={open}
      statusKind={persistenceStatus.kind}
      statusLabel={persistenceStatus.label}
    >
      <section className="board-settings-section">
        <h3>Документ</h3>
        <p>{document.title}</p>
        <p>
          {persistenceStatus.label}
          {persistenceStatus.detail === undefined
            ? ""
            : ` · ${persistenceStatus.detail}`}
        </p>
        <div className="board-settings-actions">
          <button
            disabled={selection.state.selectedObjectIds.length === 0}
            onClick={clipboard.copy}
            type="button"
          >
            Копировать
          </button>
          <button
            disabled={selection.state.selectedObjectIds.length === 0}
            onClick={clipboard.cut}
            type="button"
          >
            Вырезать
          </button>
          <button
            disabled={!clipboard.hasContent}
            onClick={clipboard.paste}
            type="button"
          >
            Вставить
          </button>
          {onImportDocument === undefined ? null : (
            <label className="board-settings-file">
              Импорт JSON
              <input
                accept="application/json,.json"
                aria-label="Импорт документа JSON"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file !== undefined) onImportDocument(file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          )}
          {onExportDocument === undefined ? null : (
            <button onClick={() => onExportDocument(document)} type="button">
              Экспорт JSON
            </button>
          )}
          {onExportSvgSnapshot === undefined ? null : (
            <button onClick={() => onExportSvgSnapshot(document)} type="button">
              Снимок SVG
            </button>
          )}
          {onExportPngSnapshot === undefined ? null : (
            <button onClick={() => onExportPngSnapshot(document)} type="button">
              Снимок PNG
            </button>
          )}
          {onExportPdfSnapshot === undefined ? null : (
            <button onClick={() => onExportPdfSnapshot(document)} type="button">
              Сохранить PDF
            </button>
          )}
          {onShareBoard === undefined ? (
            <button
              disabled
              title="Откройте доску из занятия, чтобы включить совместную работу"
              type="button"
            >
              Совместная ссылка
            </button>
          ) : (
            <button onClick={onShareBoard} type="button">
              Копировать ссылку на доску
            </button>
          )}
        </div>
      </section>
      <section className="board-settings-section">
        <h3>
          Объекты и слои <span>{selection.layers.length}</span>
        </h3>
        <div className="board-settings-actions">
          <button
            disabled={!selection.canGroup}
            onClick={selection.group}
            type="button"
          >
            Сгруппировать
          </button>
          <button
            disabled={!selection.canUngroup}
            onClick={selection.ungroup}
            type="button"
          >
            Разгруппировать
          </button>
        </div>
        {selection.layers.length === 0 ? (
          <p>На доске пока нет объектов.</p>
        ) : (
          <ol className="board-settings-layers">
            {selection.layers.map((layer) => (
              <li key={layer.id}>
                <button
                  className="layer-name"
                  onClick={() => {
                    selection.selectObject(layer.id);
                    interaction.activate(selectionToolId);
                  }}
                  type="button"
                >
                  {layer.kind}
                </button>
                <button
                  aria-label={
                    layer.visible
                      ? `Скрыть ${layer.id}`
                      : `Показать ${layer.id}`
                  }
                  onClick={() =>
                    selection.setLayerVisibility(layer.id, !layer.visible)
                  }
                  type="button"
                >
                  {layer.visible ? "◉" : "○"}
                </button>
                <button
                  aria-label={
                    layer.locked
                      ? `Разблокировать слой ${layer.id}`
                      : `Заблокировать слой ${layer.id}`
                  }
                  onClick={() =>
                    selection.setLayerLock(layer.id, !layer.locked)
                  }
                  type="button"
                >
                  {layer.locked ? "🔒" : "🔓"}
                </button>
                <button
                  aria-label={`На передний план ${layer.id}`}
                  onClick={() => selection.reorderLayer(layer.id, "front")}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`На задний план ${layer.id}`}
                  onClick={() => selection.reorderLayer(layer.id, "back")}
                  type="button"
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="board-settings-section">
        <h3>Вид</h3>
        <dl className="board-settings-facts">
          <div>
            <dt>Масштаб</dt>
            <dd>{Math.round(document.viewport.zoom * 100)}%</dd>
          </div>
          <div>
            <dt>Положение</dt>
            <dd>
              x {Math.round(document.viewport.offset.x)} · y{" "}
              {Math.round(document.viewport.offset.y)}
            </dd>
          </div>
        </dl>
        <button onClick={onResetViewport} type="button">
          Центрировать доску
        </button>
      </section>
      {settingsExtra}
      <section className="board-settings-section">
        <h3>Справка и приложение</h3>
        <div className="board-settings-actions">
          <button
            aria-expanded={shortcutsOpen}
            aria-haspopup="dialog"
            onClick={onOpenShortcuts}
            ref={shortcutsButtonRef}
            type="button"
          >
            Горячие клавиши
          </button>
          {onExportDiagnostics === undefined ? null : (
            <button onClick={onExportDiagnostics} type="button">
              Диагностика
            </button>
          )}
          <a href="#/documents">Все документы</a>
          <a href="#/settings">Настройки приложения</a>
          {developmentDiagnostics ? (
            <a href="#/diagnostics">Диагностика приложения</a>
          ) : null}
        </div>
        <p>
          BoardDocument {boardDocumentSchemaVersion} · {stage}
        </p>
      </section>
    </BoardSettingsDialog>
  );
}
