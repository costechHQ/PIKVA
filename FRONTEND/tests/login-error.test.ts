import { describe, expect, test } from "bun:test";

import { loginErrorMessage } from "@/lib/login-error";

describe("loginErrorMessage", () => {
  test("401 keeps FastAPI's wording", () => {
    expect(loginErrorMessage(401, { detail: "Invalid email or password" }, null)).toBe(
      "Invalid email or password",
    );
  });

  test("401 without a usable detail falls back", () => {
    expect(loginErrorMessage(401, "not json", null)).toBe("Invalid email or password");
  });

  test("422 field-error lists become a plain sentence", () => {
    const body = { detail: [{ loc: ["body", "email"], msg: "value is not a valid email" }] };
    expect(loginErrorMessage(422, body, null)).toBe("Enter a valid email address and your password.");
  });

  test("429 rounds Retry-After up to minutes", () => {
    expect(loginErrorMessage(429, {}, "61")).toBe("Too many sign-in attempts. Try again in 2 minutes.");
    expect(loginErrorMessage(429, {}, "30")).toBe("Too many sign-in attempts. Try again in 1 minute.");
  });

  test("429 without Retry-After asks the user to wait", () => {
    expect(loginErrorMessage(429, {}, null)).toBe("Too many sign-in attempts. Please wait and try again.");
    expect(loginErrorMessage(429, {}, "soon")).toBe("Too many sign-in attempts. Please wait and try again.");
  });

  test("502 shows the BFF's unavailable message", () => {
    const body = { detail: "Pikva service is unavailable. Try again shortly." };
    expect(loginErrorMessage(502, body, null)).toBe("Pikva service is unavailable. Try again shortly.");
  });

  test("anything else is generic and never echoes the body", () => {
    expect(loginErrorMessage(500, { detail: "Traceback ..." }, null)).toBe("Sign-in failed. Please try again.");
  });
});
