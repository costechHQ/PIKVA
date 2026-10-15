/**
 * Changing a password while signed in (SRS 6.8). Runs last (files run in
 * name order): it signs the parent out of the session other files reuse.
 */
import { expect, test } from "@playwright/test";

import { authFile, readState } from "./state";

const state = readState();
const NEW_PASSWORD = `New-${state.tag}-pw2`;

// Before the password change below, which ends the parent's saved session.
test("parent edits their own phone; the email cannot be edited", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: authFile("parent") })).newPage();
  await page.goto("/parent/settings");

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await page.getByLabel("Phone number").fill("0712345678");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Your details were saved.")).toBeVisible();
  await expect(page.getByText("0712345678")).toBeVisible();
});

test("gate staff rename themselves and the top bar follows", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: authFile("gate") })).newPage();
  const newName = `Sule Renamed ${state.tag}`;
  await page.goto("/account");

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Full name").fill(newName);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Your details were saved.")).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(newName);
});

test("parent changes their password, stays signed in, and other sessions end", async ({ browser }) => {
  const here = await browser.newContext({ storageState: authFile("parent") });
  const elsewhere = await browser.newContext({ storageState: authFile("parent") });
  const page = await here.newPage();
  await page.goto("/parent/settings");

  // Mistakes are caught: wrong current password, then mismatched new ones.
  await page.getByLabel("Current password").fill("not-the-password-1");
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("New password again").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your current password is not correct")).toBeVisible();

  await page.getByLabel("Current password").fill(state.password);
  await page.getByLabel("New password again").fill(`${NEW_PASSWORD}x`);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("The two new passwords do not match.")).toBeVisible();

  await page.getByLabel("New password again").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");

  // This browser is still signed in; the older session elsewhere is not.
  await page.goto("/parent");
  await expect(page).toHaveURL(/\/parent$/);
  const other = await elsewhere.newPage();
  await other.goto("/parent");
  await expect(other).toHaveURL(/\/login/);
  // Arrived by redirect: let the form finish loading before typing.
  await other.waitForLoadState("networkidle");

  // The new password signs in.
  await other.getByLabel("Email address").fill(state.parent.email);
  await other.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await other.getByRole("button", { name: "Sign In" }).click();
  await expect(other).toHaveURL(/\/parent$/);
});

test("staff reach their Account page from the top bar", async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFile("gate") });
  const page = await context.newPage();
  await page.goto("/gate");

  // Their name in the top bar (renamed above, so found by where it leads).
  await page.getByRole("banner").locator('a[href="/account"]').click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Current password")).toBeVisible();
});
