import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "coordinate-plot-visual.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "light",
    locale: "ru-RU",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "visual-chromium-desktop",
      use: { browserName: "chromium", viewport: { height: 900, width: 1440 } },
    },
    {
      name: "visual-firefox-desktop",
      use: { browserName: "firefox", viewport: { height: 900, width: 1440 } },
    },
    {
      name: "visual-chromium-mobile-portrait",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { height: 844, width: 390 },
      },
    },
    {
      name: "visual-chromium-mobile-landscape",
      use: {
        browserName: "chromium",
        hasTouch: true,
        isMobile: true,
        viewport: { height: 390, width: 844 },
      },
    },
  ],
});
