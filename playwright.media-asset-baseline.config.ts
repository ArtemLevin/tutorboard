import { defineConfig, devices } from "@playwright/test";

import mediaFullstack from "./playwright.media-fullstack.config.js";

export default defineConfig({
  ...mediaFullstack,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  testMatch: "media-asset-baseline.spec.ts",
  timeout: 240_000,
  workers: 1,
});
