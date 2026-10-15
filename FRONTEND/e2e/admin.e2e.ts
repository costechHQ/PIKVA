/**
 * Admin flows in a real browser (SRS 6.7, 18.2-18.4): signing in through
 * the form, adding a parent and their pupil, editing the pupil, and the
 * pages each role may not open.
 */
import { type Browser, type Page, expect, test } from "@playwright/test";

import { type Role, authFile, readState } from "./state";

test.describe.configure({ mode: "serial" });

const state = readState();

async function as(browser: Browser, role: Role): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(role) });
  return context.newPage();
}

test("admin signs in through the login form and lands on the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(state.admin.email);
  await page.getByLabel("Password", { exact: true }).fill(state.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pupils", exact: true })).toBeVisible();
});

test("admin adds a parent, then a pupil for them", async ({ browser }) => {
  const page = await as(browser, "admin");
  const parentName = `Emeka Second ${state.tag}`;

  await page.goto("/admin/users");
  await page.getByRole("link", { name: "Add user" }).click();
  await page.getByLabel("Parent").check();
  await page.getByLabel("Full name").fill(parentName);
  await page.getByLabel("Email").fill(`second-${state.tag}@example.com`);
  await page.getByLabel("Phone number").fill("0744444444");
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByRole("heading", { name: `${parentName} added as a parent` })).toBeVisible();

  await page.getByRole("link", { name: "Add their pupil" }).click();
  await page.getByLabel("Find a parent").fill("emeka second");
  await page.getByLabel("Parent", { exact: true }).selectOption({ label: `${parentName} · second-${state.tag}@example.com` });
  await page.getByLabel("First name").fill("Bayo");
  await page.getByLabel("Last name").fill(state.tag);
  await page.getByLabel("Date of birth").fill("2017-03-04");
  await page.getByRole("button", { name: "Add pupil" }).click();

  await expect(page.getByRole("status")).toContainText(`Bayo ${state.tag} added and linked to ${parentName}`);
});

test("admin finds and edits a pupil", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto("/admin/pupils");
  await page.getByRole("searchbox", { name: "Search pupils" }).fill(state.parent.name);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("status")).toContainText("1 of");

  await page.getByRole("link", { name: `${state.pupil.first_name} ${state.pupil.last_name}` }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("First name").fill("Adaeze");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Pupil details saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Adaeze ${state.pupil.last_name}` })).toBeVisible();
});

test("each role is kept to its own pages", async ({ browser }) => {
  const checks: [Role, string, RegExp][] = [
    ["parent", "/admin", /\/parent$/],
    ["gate", "/admin/pupils", /\/gate$/],
    ["gate", "/parent", /\/gate$/],
    ["admin", "/gate", /\/admin$/],
  ];
  for (const [role, path, home] of checks) {
    const page = await as(browser, role);
    await page.goto(path);
    await expect(page, `${role} opening ${path}`).toHaveURL(home);
    await page.context().close();
  }
});

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/admin/pupils");
  await expect(page).toHaveURL(/\/login/);
});
