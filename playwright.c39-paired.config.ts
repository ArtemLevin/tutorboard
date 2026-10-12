import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

const cwd = process.env.C39_PRODUCTION_ROOT;
if (!cwd) throw new Error("C39_PRODUCTION_ROOT is required");
export default defineConfig({
  ...base,
  workers: 1,
  retries: 0,
  reporter: "line",
  ...(process.env.C39_OUTPUT_DIR
    ? { outputDir: process.env.C39_OUTPUT_DIR }
    : {}),
  webServer: (Array.isArray(base.webServer)
    ? base.webServer
    : [base.webServer!]
  ).map((server) => ({
    ...server,
    cwd,
    reuseExistingServer: false,
  })),
});
