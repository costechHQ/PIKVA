/**
 * Pickup person photos in a real browser (SRS 9.3): the parent chooses a
 * photo from the device, the admin sees it before approving, the gate sees
 * it when checking a code, and the parent removes it again.
 */
import { deflateSync } from "node:zlib";

import { type Browser, type Locator, type Page, expect, test } from "@playwright/test";

import { type Role, authFile } from "./state";

test.describe.configure({ mode: "serial" });

const PICKER = "Aunty Photo";
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

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

/** A small solid-colour PNG, so the test needs no image file. */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", pixels),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The image has actually loaded (not a broken image icon). */
async function expectLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
}

test("parent adds a pickup person with a photo from their device", async ({ browser }) => {
  const page = await as(browser, "parent");
  await page.goto("/parent/pickup-people");

  await page.getByRole("button", { name: "Add pickup person" }).first().click();
  await page.getByLabel("Full name").fill(PICKER);
  await page.getByLabel("Phone number").fill("0733333333");
  await page.getByLabel("Relationship to pupil").fill("Aunt");
  await page.getByLabel("Until").fill(localInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)));

  // A file the browser already knows is not a photo is refused before uploading.
  await page.getByLabel("Choose photo").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText("Choose a JPEG, PNG or WebP photo.")).toBeVisible();

  await page.getByLabel("Choose photo").setInputFiles({ name: "aunty.png", mimeType: "image/png", buffer: png(300, 200, [200, 80, 40]) });
  await expectLoaded(page.getByRole("img", { name: "Preview of the chosen photo" }));
  await expect(page.getByText("This photo will be saved with the details.")).toBeVisible();

  await page.getByRole("button", { name: "Add pickup person" }).last().click();

  await expect(page.getByRole("status")).toContainText(`${PICKER} added. Your school needs to approve them`);
  const card = page.locator("article", { hasText: PICKER });
  await expectLoaded(card.locator("img"));
});

test("admin sees the photo before approving", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto("/admin/approvals");

  const card = page.locator("article", { hasText: PICKER });
  await expectLoaded(card.getByRole("img", { name: `Photo of ${PICKER}` }));
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toContainText(`${PICKER} approved`);
});

test("gate sees the photo when checking the code", async ({ browser }) => {
  const parent = await as(browser, "parent");
  await parent.goto("/parent/pickup-people");
  const card = parent.locator("article", { hasText: PICKER });
  await card.getByRole("button", { name: "Get today's code" }).click();
  await card.getByRole("button", { name: "Get new code" }).click();
  const shown = card.locator('[aria-label^="Code "]');
  await expect(shown).toBeVisible();
  code = ((await shown.textContent()) ?? "").replace(/\s/g, "");

  const gate = await as(browser, "gate");
  await gate.goto("/gate");
  await gate.getByLabel("Pickup code").fill(code);
  await gate.getByRole("button", { name: "Check code" }).click();
  await expect(gate.getByRole("heading", { name: "Code valid" })).toBeVisible();
  await expectLoaded(gate.getByRole("img", { name: `Photo of ${PICKER}` }));
});

test("parent removes the photo, which needs approval again", async ({ browser }) => {
  const page = await as(browser, "parent");
  await page.goto("/parent/pickup-people");
  const card = page.locator("article", { hasText: PICKER });

  await card.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByText("The photo will be removed when you save.")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("status")).toContainText(`${PICKER} updated. Your school needs to approve them`);
  await expect(card.locator("img")).toHaveCount(0);
  await expect(card.getByText("Awaiting approval")).toBeVisible();

  // Leave nothing waiting in the school's Approvals queue for other tests.
  await card.getByRole("button", { name: "Deactivate" }).click();
  await card.getByRole("button", { name: "Deactivate" }).last().click();
  await expect(page.getByRole("status")).toContainText(`${PICKER} deactivated`);
});
