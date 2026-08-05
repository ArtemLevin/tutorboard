export const persistenceAdapterContractVersion = "1.0" as const;

export {
  createDexieBoardDocumentRepository,
  defaultTutorBoardDatabaseName,
  DexieBoardDocumentRepository,
  localPersistenceMigrations,
} from "./repository";
export {
  defaultBoardSyncDatabaseName,
  DexiePendingBoardCommandQueue,
  createDexiePendingBoardCommandQueue,
  type PendingCommandQuarantineReason,
  type QuarantinedPendingBoardCommand,
} from "./sync-queue";
