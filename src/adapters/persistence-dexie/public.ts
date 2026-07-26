export const persistenceAdapterContractVersion = "1.0" as const;

export {
  createDexieBoardDocumentRepository,
  defaultTutorBoardDatabaseName,
  DexieBoardDocumentRepository,
  localPersistenceMigrations,
} from "./repository";
