/**
 * Every page at phone width (390 px) and on a laptop: it loads without
 * browser errors, shows its heading and never scrolls sideways (wide tables
 * scroll inside their own box instead).
 */
import { type Page, expect, test } from "@playwright/test";

import { type Role, authFile, readState } from "./state";

const state = readState();

const PAGES: Record<Role, string[]> = {
  admin: [
    "/admin",
    "/admin/pupils",
    `/admin/pupils/${state.pupil.id}`,
    "/admin/pupils/new",
    "/admin/pickup-people",
    "/admin/approvals",
    "/admin/pickup-history",
    "/admin/alerts",
    "/admin/audit-log",
    "/admin/users",
    "/admin/users/new",
    "/account",
  ],
  parent: [
    "/parent",
    "/parent/pupils",
    `/parent/pupils/${state.pupil.id}`,
    "/parent/pickup-people",
    "/parent/pickup-history",
    "/parent/settings",
  ],
  gate: ["/gate", "/account"],
};

const VIEWPORTS = { phone: { width: 390, height: 844 }, laptop: { width: 1280, height: 800 } };

/**
 * `next dev` serves this development-only manifest as JSON, which the
 * nosniff security header (next.config.ts) stops the browser running. It
 * does not exist in production builds, so it is not an app error.
 */
const DEV_SERVER_NOISE = "/_next/static/development/_clientMiddlewareManifest.js";

async function checkPage(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes(DEV_SERVER_NOISE)) errors.push(message.text());
  });

  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Let browser-only content (times in the viewer's zone) render.
  await page.waitForLoadState("networkidle");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  expect(errors, `${path} browser errors`).toEqual([]);
}

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const role of Object.keys(PAGES) as Role[]) {
    test(`${role} pages fit a ${viewportName} screen without errors`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: authFile(role), viewport });
      const page = await context.newPage();
      for (const path of PAGES[role]) await checkPage(page, path);
      await context.close();
    });
  }
}

test("sign-in pages fit a phone screen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: VIEWPORTS.phone });
  const page = await context.newPage();
  for (const path of ["/", "/login", "/forgot-password"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  await context.close();
});
