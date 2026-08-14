import {
  boardDocumentSchemaVersion,
  type BoardDocument,
  type BoardObject,
} from "../../../core/public";
import type { BoardDrawingController } from "../controllers/useBoardDrawingController";
import type { BoardDocumentController } from "../controllers/useBoardDocumentController";
import type { BoardSelectionController } from "../controllers/useBoardSelectionController";

export interface BoardDiagnosticsProps {
  readonly document: BoardDocument;
  readonly documentController: BoardDocumentController;
  readonly drawing: BoardDrawingController;
  readonly persistenceLabel: string;
  readonly selection: BoardSelectionController;
  readonly firstObject?: BoardObject | undefined;
}

export function BoardDiagnostics({
  document,
  documentController,
  drawing,
  firstObject,
  persistenceLabel,
  selection,
}: BoardDiagnosticsProps) {
  const { commandError, history } = documentController;
  return (
    <div className="visually-hidden" data-testid="minimal-board-diagnostics">
      <span>BoardDocument {boardDocumentSchemaVersion}</span>
      <span data-testid="first-object-position">
        Объект: {firstObject?.position.x ?? 0}, {firstObject?.position.y ?? 0}
      </span>
      <span data-testid="first-object-transform">
        Масштаб: {firstObject?.scale.x ?? 1}, {firstObject?.scale.y ?? 1} ·
        Поворот: {firstObject?.rotation ?? 0}°
      </span>
      <span data-testid="object-count">{document.order.length} объекта</span>
      <span data-testid="interaction-state">{drawing.state.kind}</span>
      <span data-testid="history-depth">
        {history.past.length}/{history.future.length}
      </span>
      <span data-testid="selection-count">
        {selection.state.selectedObjectIds.length} выбрано
      </span>
      <span data-testid="viewport-zoom">
        {Math.round(document.viewport.zoom * 100)}%
      </span>
      <span data-testid="viewport-offset">
        x {Math.round(document.viewport.offset.x)} · y{" "}
        {Math.round(document.viewport.offset.y)}
      </span>
      <span data-testid="geometry-import-count">
        {Object.keys(document.geometryImports).length} построений
      </span>
      <span data-testid="group-count">
        {Object.keys(document.groups).length} групп
      </span>
      <span data-testid="persistence-status">{persistenceLabel}</span>
      {selection.layers.map((layer) => (
        <span key={layer.id}>{layer.kind}</span>
      ))}
      {drawing.diagnostic === null ? null : (
        <span data-testid="drawing-diagnostic">{drawing.diagnostic}</span>
      )}
      {commandError === null ? null : <span role="alert">{commandError}</span>}
    </div>
  );
}
