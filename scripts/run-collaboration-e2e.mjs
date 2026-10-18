import { spawnSync } from "node:child_process";

// The collaboration E2E covers real binary upload and guest media leases.
// Vite captures feature flags at build time; setting one only for Playwright
// would silently build the embedded-image variant instead.
const env = {
  ...process.env,
  VITE_FEATURE_MEDIA_ASSET_IMPORT: "true",
  VITE_FEATURE_SERVER_SYNC: "true",
};
const executable = process.platform === "win32" ? "npm.cmd" : "npm";

for (const args of [
  ["run", "build"],
  ["exec", "--", "playwright", "test", "--config", "playwright.fullstack.config.ts"],
]) {
  const child = spawnSync(executable, args, {
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (child.error) {
    console.error(child.error);
    process.exit(1);
  }
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}
