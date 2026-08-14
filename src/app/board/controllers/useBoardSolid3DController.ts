import { useCallback, useMemo, useState } from "react";

import {
  solidLearningAttemptId,
  type Solid3DId,
  type Solid3DRecord,
  type SolidLearningAttemptAction,
  type Solid3DLearningScenario,
  type SolidLearningMode,
  type SolidSectionResult,
} from "../../../core/public";
import {
  createProjectSolid3DSectionCommand,
  createUpdateSolid3DCommand,
  findSolidModelBySelection,
} from "../../../modules/solid-3d/public";
import {
  createCompleteSolidLearningCommand,
  createResetSolidLearningCommand,
  createSolidLearningActionCommand,
  createStartSolidLearningCommand,
  selectActiveSolidLearningAttempt,
  selectSolidLearningAttempts,
} from "../../../modules/solid-3d-learning/public";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardSelectionController } from "./useBoardSelectionController";

export interface UseBoardSolid3DControllerOptions {
  readonly announce: (message: string) => void;
  readonly documentController: BoardDocumentController;
  readonly enabled: boolean;
  readonly selection: BoardSelectionController;
}

export function useBoardSolid3DController({
  announce,
  documentController,
  enabled,
  selection,
}: UseBoardSolid3DControllerOptions) {
  const { commitCommand, createCommandMetadata, document, getDocument } =
    documentController;
  const [editorId, setEditorId] = useState<Solid3DId | null>(null);

  const selectedRecord = useMemo(
    () =>
      enabled
        ? findSolidModelBySelection(document, selection.state.selectedObjectIds)
        : null,
    [document, enabled, selection.state.selectedObjectIds],
  );
  const record: Solid3DRecord | null =
    editorId === null ? null : (document.solidModels[editorId] ?? null);
  const learningAttempt =
    record === null
      ? null
      : selectActiveSolidLearningAttempt(document, record.id);
  const learningAttempts =
    record === null ? [] : selectSolidLearningAttempts(document, record.id);

  const openSelected = useCallback(() => {
    if (selectedRecord !== null) setEditorId(selectedRecord.id);
  }, [selectedRecord]);

  const project = useCallback(
    (sectionId: string, section: SolidSectionResult) => {
      if (record === null) return;
      const sourceGroup = getDocument().groups[record.rootGroupId];
      const command = createProjectSolid3DSectionCommand({
        metadata: createCommandMetadata(),
        record,
        section,
        sectionId,
        token: crypto.randomUUID(),
        translation: {
          x: (sourceGroup?.transform.translation.x ?? 0) + 280,
          y: sourceGroup?.transform.translation.y ?? 0,
        },
      });
      const result = commitCommand(command);
      if (result.ok) {
        announce("Сечение добавлено на доску");
        selection.replaceSelection(command.objects.map(({ id }) => id));
      }
    },
    [
      announce,
      commitCommand,
      createCommandMetadata,
      getDocument,
      record,
      selection,
    ],
  );

  const updateRecord = useCallback(
    (replacement: Solid3DRecord) => {
      const current = getDocument().solidModels[replacement.id];
      if (current === undefined) return;
      commitCommand(
        createUpdateSolid3DCommand({
          expected: current,
          metadata: createCommandMetadata(),
          replacement,
        }),
      );
    },
    [commitCommand, createCommandMetadata, getDocument],
  );

  const startLearning = useCallback(
    (scenario: Solid3DLearningScenario, mode: SolidLearningMode) => {
      if (record === null) return;
      commitCommand(
        createStartSolidLearningCommand({
          attemptId: solidLearningAttemptId(
            `solid-learning:${crypto.randomUUID()}`,
          ),
          metadata: createCommandMetadata(),
          mode,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          solidId: record.id,
        }),
      );
    },
    [commitCommand, createCommandMetadata, record],
  );

  const learningAction = useCallback(
    (action: SolidLearningAttemptAction) => {
      if (record === null) return;
      const current = selectActiveSolidLearningAttempt(
        getDocument(),
        record.id,
      );
      if (current === null) return;
      commitCommand(
        createSolidLearningActionCommand({
          action,
          attempt: current,
          metadata: createCommandMetadata(),
        }),
      );
    },
    [commitCommand, createCommandMetadata, getDocument, record],
  );

  const resetLearning = useCallback(() => {
    if (record === null) return;
    const current = selectActiveSolidLearningAttempt(getDocument(), record.id);
    if (current === null) return;
    commitCommand(
      createResetSolidLearningCommand({
        attempt: current,
        metadata: createCommandMetadata(),
      }),
    );
  }, [commitCommand, createCommandMetadata, getDocument, record]);

  const completeLearning = useCallback(() => {
    if (record === null) return;
    const current = selectActiveSolidLearningAttempt(getDocument(), record.id);
    if (current === null) return;
    commitCommand(
      createCompleteSolidLearningCommand({
        attempt: current,
        metadata: createCommandMetadata(),
      }),
    );
  }, [commitCommand, createCommandMetadata, getDocument, record]);

  return {
    close: () => setEditorId(null),
    completeLearning,
    editorId,
    learningAction,
    learningAttempt,
    learningAttempts,
    open: (id: Solid3DId) => setEditorId(id),
    openSelected,
    project,
    record,
    resetLearning,
    selectedRecord,
    startLearning,
    updateRecord,
  } as const;
}

export type BoardSolid3DController = ReturnType<
  typeof useBoardSolid3DController
>;
