from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "src/core/ports/board-sync-repository.ts",
    "  readonly archivedAt: string | null;\n  readonly currentDocumentSha256: string;",
    "  readonly archivedAt: string | null;\n  readonly createdAt?: string;\n  readonly currentDocumentSha256: string;",
)
replace_once(
    "src/core/ports/board-sync-repository.ts",
    "  readonly studentId?: string;\n}",
    "  readonly studentId?: string;\n  readonly updatedAt?: string;\n}",
)

replace_once(
    "src/adapters/board-http/client.ts",
    '    lessonId: identifierSchema,\n    schemaVersion: z.literal("1.0").optional(),\n    snapshotDue: z.boolean(),\n    studentId: identifierSchema,',
    '    lessonId: identifierSchema.nullable().optional(),\n    schemaVersion: z.literal("1.0").optional(),\n    snapshotDue: z.boolean(),\n    studentId: identifierSchema.nullable().optional(),',
)
replace_once(
    "src/adapters/board-http/client.ts",
    "  return {\n    ...parsed.data,\n    archivedAt: parsed.data.archivedAt ?? null,\n    documentId: documentId(parsed.data.documentId),\n  };",
    "  const { lessonId, studentId, ...descriptor } = parsed.data;\n  return {\n    ...descriptor,\n    archivedAt: descriptor.archivedAt ?? null,\n    documentId: documentId(descriptor.documentId),\n    ...(lessonId === null || lessonId === undefined ? {} : { lessonId }),\n    ...(studentId === null || studentId === undefined ? {} : { studentId }),\n  };",
)

sync_path = Path("src/modules/server-sync/sync.ts")
sync_text = sync_path.read_text()
start = sync_text.index(
    '      if (recovery.snapshot === null) {\n        if (!this.#context.capabilities.includes("board.snapshot.write")) {'
)
end_marker = '      } else {\n        if (\n          recovery.snapshot.documentId'
end = sync_text.index(end_marker, start)
replacement = (
    '      if (recovery.snapshot === null) {\n'
    '        const createdAt = recovery.board.createdAt ?? this.#now();\n'
    '        const document = createEmptyBoardDocument({\n'
    '          createdAt,\n'
    '          id: this.#documentId,\n'
    '          title:\n'
    '            this.#context.principalType === "legacy"\n'
    '              ? "Доска занятия"\n'
    '              : "Совместная доска",\n'
    '        });\n'
    '        const sha256 = await boardDocumentSha256(document);\n'
    '        if (this.#context.capabilities.includes("board.snapshot.write")) {\n'
    '          await this.#repository.saveSnapshot(\n'
    '            this.#documentId,\n'
    '            0,\n'
    '            document,\n'
    '            sha256,\n'
    '            this.#context.csrfToken,\n'
    '          );\n'
    '          if (this.#disposed) return;\n'
    '        }\n'
    '        head = {\n'
    '          document,\n'
    '          documentId: this.#documentId,\n'
    '          revision: 0,\n'
    '          session: confirmedSession(this.#context),\n'
    '          sha256,\n'
    '        };\n'
    '      } else {\n'
    '        if (\n'
    '          recovery.snapshot.documentId'
)
sync_path.write_text(sync_text[:start] + replacement + sync_text[end + len(end_marker) :])

replace_once(
    "src/app/SyncedApp.tsx",
    "import {\n  reduceBoardDocument,",
    'import type { BoardRuntimeAccessContext } from "../core/access/public";\nimport {\n  reduceBoardDocument,',
)
replace_once(
    "src/app/SyncedApp.tsx",
    "interface SyncedAppProps {\n  readonly documentId: DocumentId;",
    "interface SyncedAppProps {\n  readonly accessContext?: BoardRuntimeAccessContext | undefined;\n  readonly documentId: DocumentId;",
)
replace_once(
    "src/app/SyncedApp.tsx",
    "export function SyncedApp({\n  documentId,",
    "export function SyncedApp({\n  accessContext,\n  documentId,",
)
replace_once(
    "src/app/SyncedApp.tsx",
    "      new BoardSyncEngine({\n        createIdempotencyKey:",
    "      new BoardSyncEngine({\n        accessContext,\n        createIdempotencyKey:",
)
replace_once(
    "src/app/SyncedApp.tsx",
    '  const ready = state.kind === "ready";\n  useEffect(() => {\n    if (!ready) return;\n    collaboration.start();\n    if (!loadMeasuredRef.current) {',
    '  const ready = state.kind === "ready";\n  const collaborationEnabled =\n    state.kind === "ready" &&\n    state.capabilities.includes("collaboration.connect");\n  useEffect(() => {\n    if (!ready) return;\n    if (collaborationEnabled) collaboration.start();\n    if (lessonId !== undefined && !loadMeasuredRef.current) {',
)
replace_once(
    "src/app/SyncedApp.tsx",
    "  }, [collaboration, lessonId, ready, repository]);",
    "  }, [collaboration, collaborationEnabled, lessonId, ready, repository]);",
)
replace_once(
    "src/app/SyncedApp.tsx",
    "  useEffect(() => {\n    if (!ready) return;\n    const previous = previousCollaborationStatusRef.current;",
    "  useEffect(() => {\n    if (!ready || lessonId === undefined) return;\n    const previous = previousCollaborationStatusRef.current;",
)
replace_once(
    "src/app/SyncedApp.tsx",
    "  }, [collaborationStatus, ready, repository]);",
    "  }, [collaborationStatus, lessonId, ready, repository]);",
)
replace_once(
    "src/app/SyncedApp.tsx",
    '  const writeEnabled =\n    state.capabilities.includes("board.write") &&',
    '  if (collaborationStatus === "revoked") {\n    return (\n      <main className="recovery-shell">\n        <section className="recovery-card">\n          <span aria-hidden="true" className="recovery-icon">\n            !\n          </span>\n          <h1>Доступ к доске недоступен</h1>\n          <p role="alert">\n            Доступ к совместной доске был отозван. Запросите новую ссылку у преподавателя.\n          </p>\n        </section>\n      </main>\n    );\n  }\n\n  const writeEnabled =\n    state.capabilities.includes("board.write") &&',
)
replace_once(
    "src/app/SyncedApp.tsx",
    '  const canManageEvidence =\n    lessonId !== undefined &&\n    (state.role === "admin" || state.role === "tutor");',
    '  const canManageEvidence =\n    lessonId !== undefined &&\n    (state.role === "admin" || state.role === "tutor");\n  const principalLabel =\n    state.principalType === "guest"\n      ? `Ученик · ${accessContext?.displayName ?? state.actorId}`\n      : state.principalType === "teacher"\n        ? `Преподаватель · ${accessContext?.displayName ?? state.actorId}`\n        : "Контекст занятия";',
)
replace_once(
    "src/app/SyncedApp.tsx",
    '        onExportPdfSnapshot={(document) => {\n          setEvidenceStatus("Создаём PDF доски…");\n          void renderBoardSnapshotPdf(document)\n            .then((blob) => {\n              downloadBlob("tutorboard-board.pdf", blob);\n              setEvidenceStatus("PDF доски сохранён.");\n            })\n            .catch(() => setEvidenceStatus("Не удалось создать PDF доски."));\n        }}',
    '        onExportPdfSnapshot={\n          state.capabilities.includes("board.export")\n            ? (document) => {\n                setEvidenceStatus("Создаём PDF доски…");\n                void renderBoardSnapshotPdf(document)\n                  .then((blob) => {\n                    downloadBlob("tutorboard-board.pdf", blob);\n                    setEvidenceStatus("PDF доски сохранён.");\n                  })\n                  .catch(() =>\n                    setEvidenceStatus("Не удалось создать PDF доски."),\n                  );\n              }\n            : undefined\n        }',
)
replace_once(
    "src/app/SyncedApp.tsx",
    '        onShareBoard={() => {\n          void copyBoardShareUrl(window.location)\n            .then(() => setEvidenceStatus("Ссылка на доску скопирована."))\n            .catch(() =>\n              setEvidenceStatus("Браузер не разрешил скопировать ссылку."),\n            );\n        }}',
    '        onShareBoard={\n          lessonId === undefined\n            ? undefined\n            : () => {\n                void copyBoardShareUrl(window.location)\n                  .then(() =>\n                    setEvidenceStatus("Ссылка на доску скопирована."),\n                  )\n                  .catch(() =>\n                    setEvidenceStatus(\n                      "Браузер не разрешил скопировать ссылку.",\n                    ),\n                  );\n              }\n        }',
)
replace_once(
    "src/app/SyncedApp.tsx",
    "        readOnly={!writeEnabled}\n        settingsExtra={",
    "        readOnly={!writeEnabled}\n        standaloneMode={accessContext !== undefined}\n        settingsExtra={",
)
replace_once(
    "src/app/SyncedApp.tsx",
    '            <h3>{lessonId === undefined ? "Совместная доска" : "Занятие"}</h3>\n            <p>\n              {collaborationStatus === "revoked"',
    '            <h3>{lessonId === undefined ? "Совместная доска" : "Занятие"}</h3>\n            <p>{principalLabel}</p>\n            {!writeEnabled ? <p>Режим только для чтения</p> : null}\n            <p>\n              {collaborationStatus === "revoked"',
)

replace_once(
    "src/app/App.tsx",
    "  readonly settingsExtra?: ReactNode;\n  readonly remoteCursors?:",
    "  readonly settingsExtra?: ReactNode;\n  readonly standaloneMode?: boolean;\n  readonly remoteCursors?:",
)
replace_once(
    "src/app/App.tsx",
    "  settingsExtra,\n  remoteCursors = [],",
    "  settingsExtra,\n  standaloneMode = false,\n  remoteCursors = [],",
)
replace_once(
    "src/app/App.tsx",
    "          stage={environment.stage}\n        />",
    "          stage={environment.stage}\n          standaloneMode={standaloneMode}\n        />",
)

replace_once(
    "src/app/board/views/BoardSettingsPanel.tsx",
    "  readonly stage: string;\n}",
    "  readonly stage: string;\n  readonly standaloneMode?: boolean;\n}",
)
replace_once(
    "src/app/board/views/BoardSettingsPanel.tsx",
    "  stage,\n}: BoardSettingsPanelProps) {",
    "  stage,\n  standaloneMode = false,\n}: BoardSettingsPanelProps) {",
)
replace_once(
    "src/app/board/views/BoardSettingsPanel.tsx",
    '          {onShareBoard === undefined ? (\n            <button\n              disabled\n              title="Откройте доску из занятия, чтобы включить совместную работу"\n              type="button"\n            >\n              Совместная ссылка\n            </button>\n          ) : (\n            <button onClick={onShareBoard} type="button">\n              Копировать ссылку на доску\n            </button>\n          )}',
    '          {onShareBoard === undefined ? (\n            standaloneMode ? null : (\n              <button\n                disabled\n                title="Откройте доску из занятия, чтобы включить совместную работу"\n                type="button"\n              >\n                Совместная ссылка\n              </button>\n            )\n          ) : (\n            <button onClick={onShareBoard} type="button">\n              Копировать ссылку на доску\n            </button>\n          )}',
)
replace_once(
    "src/app/board/views/BoardSettingsPanel.tsx",
    '          <a href="#/documents">Все документы</a>\n          <a href="#/settings">Настройки приложения</a>\n          {developmentDiagnostics ? (\n            <a href="#/diagnostics">Диагностика приложения</a>\n          ) : null}',
    '          {standaloneMode ? null : (\n            <>\n              <a href="#/documents">Все документы</a>\n              <a href="#/settings">Настройки приложения</a>\n              {developmentDiagnostics ? (\n                <a href="#/diagnostics">Диагностика приложения</a>\n              ) : null}\n            </>\n          )}',
)
