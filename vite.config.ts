import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const boardApiProxyTarget = process.env.TUTORBOARD_API_PROXY_TARGET;

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  preview: {
    proxy: {
      ...(boardApiProxyTarget === undefined
        ? {}
        : {
            "/api": {
              changeOrigin: true,
              target: boardApiProxyTarget,
              ws: true,
            },
            "/login": {
              changeOrigin: true,
              target: boardApiProxyTarget,
            },
          }),
      "/geometryos": {
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/geometryos/, ""),
        target: "http://127.0.0.1:4180",
      },
    },
  },
  test: {
    environment: "jsdom",
    exclude: [
      "**/node_modules/**",
      "tests/e2e/**",
      "tests/fullstack/**",
      "tests/live/**",
    ],
    setupFiles: ["./src/test/setup.ts"],
  },
});
