/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_STAGE?: "development" | "test" | "production";
  readonly VITE_GEOMETRYOS_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
