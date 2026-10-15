import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (bun run test:e2e). They run against an already running
 * web app and backend in development, never production: start FastAPI and
 * `bun dev` first. e2e/global-setup.ts creates a throwaway school in the
 * dev database and global-teardown.ts removes it.
 *
 * Files end in .e2e.ts so `bun test` (unit tests) never picks them up.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  // One shared school and journeys that build on each other: run in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: process.env.PIKVA_WEB_URL ?? "http://localhost:3000",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
