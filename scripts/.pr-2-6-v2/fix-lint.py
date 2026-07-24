from pathlib import Path

ROOT = Path.cwd()


def replace(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing expected text in {path}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace(
    "src/adapters/persistence-dexie/repository.ts",
    '''          let recovery: BoardDocumentRecoveryRecord | null = null;
          if (validHead === null) {
            recovery = makeInvalidStorageRecovery(
              documentId,
              rawHead,
              capturedAt,
              null,
              rawHead === undefined ? "missing-head" : "invalid-storage-record",
            );
          } else if (currentRaw === undefined) {
            recovery = makeInvalidStorageRecovery(
              documentId,
              validHead,
              capturedAt,
              currentRevisionId,
              "missing-current-revision",
            );
          } else {
            const parsedCurrent = storedRevisionSchema.safeParse(currentRaw);
            recovery = parsedCurrent.success
              ? recoveryFromSerializedRevision(
                  documentId,
                  parsedCurrent.data,
                  capturedAt,
                )
              : makeInvalidStorageRecovery(
                  documentId,
                  currentRaw,
                  capturedAt,
                  currentRevisionId,
                  "invalid-storage-record",
                );
          }
''',
    '''          const recovery: BoardDocumentRecoveryRecord | null =
            validHead === null
              ? makeInvalidStorageRecovery(
                  documentId,
                  rawHead,
                  capturedAt,
                  null,
                  rawHead === undefined
                    ? "missing-head"
                    : "invalid-storage-record",
                )
              : currentRaw === undefined
                ? makeInvalidStorageRecovery(
                    documentId,
                    validHead,
                    capturedAt,
                    currentRevisionId,
                    "missing-current-revision",
                  )
                : (() => {
                    const parsedCurrent = storedRevisionSchema.safeParse(currentRaw);
                    return parsedCurrent.success
                      ? recoveryFromSerializedRevision(
                          documentId,
                          parsedCurrent.data,
                          capturedAt,
                        )
                      : makeInvalidStorageRecovery(
                          documentId,
                          currentRaw,
                          capturedAt,
                          currentRevisionId,
                          "invalid-storage-record",
                        );
                  })();
''',
)

replace(
    "src/app/App.tsx",
    "export function createInitialDocument(): BoardDocument {\n",
    '''// The persistence bootstrap reuses this deterministic seed without importing UI state.
// eslint-disable-next-line react-refresh/only-export-components
export function createInitialDocument(): BoardDocument {
''',
)

# Playwright's browser-context callback is type-checked by the browser at runtime;
# the repository ESLint project has only the Node-side test environment available.
e2e = ROOT / "tests/e2e/persistence.spec.ts"
e2e_text = e2e.read_text(encoding="utf-8")
e2e.write_text(
    '''/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/prefer-promise-reject-errors -- IndexedDB code executes inside Playwright's browser context. */\n\n'''
    + e2e_text,
    encoding="utf-8",
)

replace(
    "tests/unit/adapters/persistence-dexie/repository.test.ts",
    "    request.onerror = () => reject(request.error);\n",
    '''    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
''',
)
replace(
    "tests/unit/adapters/persistence-dexie/repository.test.ts",
    "    transaction.onerror = () => reject(transaction.error);\n",
    '''    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
''',
)
replace(
    "tests/unit/adapters/persistence-dexie/repository.test.ts",
    "    transaction.onabort = () => reject(transaction.error);\n",
    '''    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
''',
)

replace(
    "tests/unit/modules/local-persistence/autosave.test.ts",
    '''  async load(): Promise<BoardDocumentLoadResult> {
    return { status: "empty" };
  }

  async save(input: SaveBoardDocumentInput): Promise<SaveBoardDocumentResult> {
    this.calls.push(input);
    return (
      this.results.shift() ?? {
        duplicate: false,
        revisionId: localRevisionId(`revision:${input.operationId}`),
        status: "saved",
      }
    );
  }

  async diagnose(): Promise<BoardDocumentDiagnosticBundle> {
    return {
''',
    '''  load(): Promise<BoardDocumentLoadResult> {
    return Promise.resolve({ status: "empty" });
  }

  save(input: SaveBoardDocumentInput): Promise<SaveBoardDocumentResult> {
    this.calls.push(input);
    const result = this.results.shift() ?? {
      duplicate: false,
      revisionId: localRevisionId(`revision:${input.operationId}`),
      status: "saved" as const,
    };
    return Promise.resolve(result);
  }

  diagnose(): Promise<BoardDocumentDiagnosticBundle> {
    return Promise.resolve({
''',
)
replace(
    "tests/unit/modules/local-persistence/autosave.test.ts",
    '''      schemaVersion: localDiagnosticSchemaVersion,
    };
  }
''',
    '''      schemaVersion: localDiagnosticSchemaVersion,
    });
  }
''',
)

# Remove stale diagnostics; a later failing run will write fresh output.
for name in ("check.log", "e2e.log"):
    (ROOT / "scripts/.pr-2-6-v2" / name).unlink(missing_ok=True)
