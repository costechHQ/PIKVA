import { describe, expect, test } from "bun:test";

import {
  RESET_LINK_INVALID,
  forgotErrorMessage,
  isResetTokenShape,
  newPasswordProblem,
  resetErrorMessage,
} from "@/lib/reset-error";

describe("forgotErrorMessage", () => {
  test("422 asks for a valid email", () => {
    expect(forgotErrorMessage(422, { detail: [] }, null)).toBe("Enter a valid email address.");
  });

  test("429 says how long to wait", () => {
    expect(forgotErrorMessage(429, {}, "3600")).toBe("Too many reset requests. Try again in 60 minutes.");
  });

  test("other errors are generic and never echo the body", () => {
    expect(forgotErrorMessage(500, { detail: "boom" }, null)).toBe(
      "Could not send the reset link. Please try again.",
    );
  });
});

describe("resetErrorMessage", () => {
  test("400 keeps FastAPI's wording", () => {
    expect(resetErrorMessage(400, { detail: RESET_LINK_INVALID }, null)).toBe(RESET_LINK_INVALID);
  });

  test("422 is treated as a bad link", () => {
    expect(resetErrorMessage(422, { detail: [] }, null)).toBe(RESET_LINK_INVALID);
  });

  test("502 shows the unavailable message", () => {
    expect(resetErrorMessage(502, null, null)).toBe("Pikva service is unavailable. Try again shortly.");
  });
});

describe("newPasswordProblem", () => {
  test("accepts a matching password", () => {
    expect(newPasswordProblem("NewPassword123!", "NewPassword123!")).toBeNull();
  });

  test("rejects blank, all-space, too long and mismatched passwords", () => {
    expect(newPasswordProblem("", "")).toBe("Enter a new password.");
    expect(newPasswordProblem("   ", "   ")).toBe("Enter a new password.");
    expect(newPasswordProblem("a".repeat(129), "a".repeat(129))).toBe("Use at most 128 characters.");
    expect(newPasswordProblem("one", "two")).toBe("The passwords do not match.");
  });

  test("allows spaces inside a password, like FastAPI", () => {
    expect(newPasswordProblem(" pass phrase ", " pass phrase ")).toBeNull();
  });
});

describe("isResetTokenShape", () => {
  test("accepts URL-safe tokens", () => {
    expect(isResetTokenShape("abc_DEF-123")).toBe(true);
  });

  test("rejects missing, oddly shaped or huge tokens", () => {
    expect(isResetTokenShape(undefined)).toBe(false);
    expect(isResetTokenShape(["a", "b"])).toBe(false);
    expect(isResetTokenShape("")).toBe(false);
    expect(isResetTokenShape("a b")).toBe(false);
    expect(isResetTokenShape("a".repeat(129))).toBe(false);
  });
});
