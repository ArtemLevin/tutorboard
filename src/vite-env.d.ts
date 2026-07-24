/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_STAGE?: "development" | "test" | "production";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
