import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  preview: {
    proxy: {
      "/geometryos": {
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/geometryos/, ""),
        target: "http://127.0.0.1:4180",
      },
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "tests/e2e/**", "tests/live/**"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
