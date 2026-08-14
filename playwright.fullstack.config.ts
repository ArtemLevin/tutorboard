import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const root = path.dirname(fileURLToPath(import.meta.url));
const backendRoot =
  process.env.TUTOR_ASSISTANT_WEB_ROOT ??
  path.resolve(root, "../tutor-assistant-web");

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/fullstack",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "UV_CACHE_DIR=/tmp/tutor-assistant-web-uv-cache uv run python tests/fullstack/collaboration_server.py",
      cwd: backendRoot,
      reuseExistingServer: false,
      timeout: 60_000,
      url: "http://127.0.0.1:4181/health/ready",
    },
    {
      command:
        "TUTORBOARD_API_PROXY_TARGET=http://127.0.0.1:4181 npm run preview -- --host 127.0.0.1 --port 4173",
      cwd: root,
      reuseExistingServer: false,
      timeout: 30_000,
      url: "http://127.0.0.1:4173/",
    },
  ],
  workers: 1,
});
