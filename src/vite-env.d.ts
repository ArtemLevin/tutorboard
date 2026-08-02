/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_STAGE?: "development" | "test" | "production";
  readonly VITE_GEOMETRYOS_BASE_URL?: string;
  readonly VITE_FEATURE_DEV_DIAGNOSTICS?: "0" | "1" | "false" | "true";
  readonly VITE_FEATURE_DOCUMENT_SNAPSHOTS?: "0" | "1" | "false" | "true";
  readonly VITE_FEATURE_GEOMETRY_PROMPT?: "0" | "1" | "false" | "true";
  readonly VITE_FEATURE_HANDWRITTEN_FUNCTIONS?:
    | "0"
    | "1"
    | "false"
    | "true";
  readonly VITE_FEATURE_SERVER_SYNC?: "0" | "1" | "false" | "true";
  readonly VITE_FEATURE_SMART_INK?: "0" | "1" | "false" | "true";
  readonly VITE_FEATURE_SMART_INK_DIAGNOSTICS?: "0" | "1" | "false" | "true";
  readonly VITE_BOARD_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
