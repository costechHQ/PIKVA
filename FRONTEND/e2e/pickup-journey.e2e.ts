/**
 * The core journey in a real browser, one role per browser context:
 * parent adds a pickup person -> admin approves -> parent gets today's code
 * -> gate checks and releases -> both histories show it (SRS 9.2, 10, 11, 12).
 */
import { type Browser, type Page, expect, test } from "@playwright/test";

import { type Role, authFile, readState } from "./state";

test.describe.configure({ mode: "serial" });

const state = readState();
const PICKER = "Uncle Obi";
let code = "";

async function as(browser: Browser, role: Role): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(role) });
  return context.newPage();
}

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, in the browser's time zone. */
function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test("parent adds a pickup person, who waits for approval", async ({ browser }) => {
  const page = await as(browser, "parent");
  await page.goto("/parent/pickup-people");

  await page.getByRole("button", { name: "Add pickup person" }).first().click();
  await page.getByLabel("Full name").fill(PICKER);
  await page.getByLabel("Phone number").fill("0722222222");
  await page.getByLabel("Relationship to pupil").fill("Uncle");
  await page.getByLabel("Until").fill(localInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)));
  await page.getByRole("button", { name: "Add pickup person" }).last().click();

  await expect(page.getByRole("status")).toContainText(`${PICKER} added. Your school needs to approve them`);
  const card = page.locator("article", { hasText: PICKER });
  await expect(card.getByText("Awaiting approval")).toBeVisible();
  await expect(card.getByRole("button", { name: "Get today's code" })).toHaveCount(0);
});

test("admin sees who sent the request and approves it", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto("/admin");
  await expect(page.getByText("waiting for approval")).toBeVisible();

  await page.getByRole("link", { name: "Review approvals" }).click();
  await expect(page).toHaveURL(/\/admin\/approvals$/);
  const card = page.locator("article", { hasText: PICKER });
  await expect(card).toContainText(state.parent.name);
  await card.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByRole("status")).toContainText(`${PICKER} approved`);
  await expect(page.getByText("Nothing waiting for approval.")).toBeVisible();
});

test("parent gets today's code after a warning", async ({ browser }) => {
  const page = await as(browser, "parent");
  await page.goto("/parent/pickup-people");
  const card = page.locator("article", { hasText: PICKER });
  await expect(card.getByText("Active")).toBeVisible();

  await card.getByRole("button", { name: "Get today's code" }).click();
  await expect(card.getByText(/Any earlier code .* will stop working/)).toBeVisible();
  await card.getByRole("button", { name: "Get new code" }).click();

  const shown = card.locator('[aria-label^="Code "]');
  await expect(shown).toBeVisible();
  code = ((await shown.textContent()) ?? "").replace(/\s/g, "");
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
  await expect(card.getByRole("img", { name: `QR code for ${PICKER}'s pickup code` })).toBeVisible();
});

test("gate catches a typo locally, then checks and releases", async ({ browser }) => {
  const page = await as(browser, "gate");
  await page.goto("/gate");
  const input = page.getByLabel("Pickup code");
  await expect(input).toBeFocused();

  await input.fill("0OI1");
  await page.getByRole("button", { name: "Check code" }).click();
  await expect(page.getByText("never 0, 1, I or O")).toBeVisible();

  await input.fill(`${code.slice(0, 4)} ${code.slice(4).toLowerCase()}`);
  await page.getByRole("button", { name: "Check code" }).click();
  await expect(page.getByRole("heading", { name: "Code valid" })).toBeVisible();
  await expect(page.getByText(PICKER)).toBeVisible();

  // Other tests may rename the pupil, so match the action, not the name.
  await page.getByRole("button", { name: /^Release / }).click();
  await expect(page.getByRole("heading", { name: / released$/ })).toBeVisible();
  await expect(page.getByText(`To ${PICKER} at`)).toBeVisible();

  // The same code a second time is refused.
  await page.getByRole("button", { name: "Next pickup" }).click();
  await page.getByLabel("Pickup code").fill(code);
  await page.getByRole("button", { name: "Check code" }).click();
  await expect(page.getByText("Do not release")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Code already used" })).toBeVisible();
});

test("gate refuses the wrong person and the code is cancelled", async ({ browser }) => {
  // A fresh code for the same pickup person.
  const parent = await as(browser, "parent");
  await parent.goto("/parent/pickup-people");
  const card = parent.locator("article", { hasText: PICKER });
  await card.getByRole("button", { name: "Get today's code" }).click();
  await card.getByRole("button", { name: "Get new code" }).click();
  const fresh = ((await card.locator('[aria-label^="Code "]').textContent()) ?? "").replace(/\s/g, "");

  const page = await as(browser, "gate");
  await page.goto("/gate");
  await page.getByLabel("Pickup code").fill(fresh);
  await page.getByRole("button", { name: "Check code" }).click();
  await expect(page.getByRole("heading", { name: "Code valid" })).toBeVisible();

  await page.getByRole("button", { name: /Don.t release/ }).click();
  await expect(page.getByText("The code is cancelled so it cannot be used at another gate")).toBeVisible();
  await page.getByRole("button", { name: "Refuse pickup" }).click();
  await expect(page.getByRole("heading", { name: "Pickup refused" })).toBeVisible();

  await page.getByRole("button", { name: "Next pickup" }).click();
  await page.getByLabel("Pickup code").fill(fresh);
  await page.getByRole("button", { name: "Check code" }).click();
  await expect(page.getByRole("heading", { name: "Code has expired" })).toBeVisible();
});

test("admin sees the release, the staff member and the alert", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto("/admin/pickup-history");
  await expect(page.getByRole("row", { name: new RegExp(PICKER) })).toContainText(state.gate.name);

  // The top bar bell shows the open count (the menu link is "Security Alerts").
  const bell = page.getByRole("link", { name: /^Security alerts/ });
  // The reused code from the release test, and the refusal (plus the expired re-check).
  await expect(bell).toHaveAccessibleName(/^Security alerts, [1-9]\d* open$/);
  await bell.click();
  await expect(page.locator("article", { hasText: "Pickup refused at the gate" })).toContainText("Open · urgent");
  const alert = page.locator("article", { hasText: "Code used again" });
  await expect(alert).toContainText(state.gate.name);
  await alert.getByRole("button", { name: "Mark resolved" }).click();
  await expect(alert.getByRole("button", { name: "Mark resolved" })).toHaveCount(0);
  await expect(alert.getByText("Resolved", { exact: true }).first()).toBeVisible();
});

test("admin deactivates from the Active filter and the list catches up", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto("/admin/pickup-people?status=active");
  const row = page.getByRole("row", { name: new RegExp(PICKER) });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await row.getByRole("button", { name: "Deactivate" }).click();

  await expect(page.getByRole("status")).toContainText(`${PICKER} deactivated.`);
  await expect(page.getByRole("row", { name: new RegExp(PICKER) })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Inactive 1/ })).toBeVisible();
});

test("parent history shows the pickup but never the staff member", async ({ browser }) => {
  const page = await as(browser, "parent");
  await page.goto("/parent/pickup-history");
  // Rows repeat the name in a phone-only line, hidden on wider screens.
  await expect(page.getByText(PICKER).filter({ visible: true }).first()).toBeVisible();
  expect(await page.content()).not.toContain(state.gate.name);
});
