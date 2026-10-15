import { describe, expect, test } from "bun:test";

import { UNAVAILABLE } from "@/lib/api-errors";
import { passwordChangeBody, passwordChangeError } from "@/lib/change-password";

describe("passwordChangeBody", () => {
  const form = { current: "Old-password-1", next: "New-password-2", confirm: "New-password-2" };

  test("builds the body, keeping passwords exactly as typed", () => {
    expect(passwordChangeBody({ ...form, next: " spaced ", confirm: " spaced " })).toEqual({
      body: { current_password: "Old-password-1", new_password: " spaced " },
    });
  });

  test("catches each mistake before sending", () => {
    expect(passwordChangeBody({ ...form, current: "" })).toEqual({ error: "Enter your current password." });
    expect(passwordChangeBody({ ...form, next: "   ", confirm: "   " })).toEqual({ error: "Enter a new password." });
    expect(passwordChangeBody({ ...form, next: "x".repeat(129), confirm: "x".repeat(129) })).toEqual({
      error: "The new password can be at most 128 characters.",
    });
    expect(passwordChangeBody({ ...form, next: form.current, confirm: form.current })).toEqual({
      error: "The new password must be different from your current one.",
    });
    expect(passwordChangeBody({ ...form, confirm: "New-password-3" })).toEqual({
      error: "The two new passwords do not match.",
    });
  });
});

test("passwordChangeError explains each answer", () => {
  expect(passwordChangeError(400, { detail: "Your current password is not correct" }, null)).toBe(
    "Your current password is not correct",
  );
  expect(passwordChangeError(422, { detail: [{ msg: "x" }] }, null)).toBe("Check the passwords and try again.");
  expect(passwordChangeError(429, null, "900")).toContain("Too many password attempts");
  expect(passwordChangeError(401, null, null)).toBe("Your session has ended. Please sign in again.");
  expect(passwordChangeError(500, null, null)).toBe(UNAVAILABLE);
});
