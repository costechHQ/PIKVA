import { describe, expect, test } from "bun:test";

import { type CheckResult, failureText, normaliseCode } from "@/lib/gate";

describe("normaliseCode", () => {
  test("removes spaces and dashes and upper-cases", () => {
    expect(normaliseCode(" 7f3b 9k2d ")).toEqual({ code: "7F3B9K2D" });
    expect(normaliseCode("7F3B-9K2D")).toEqual({ code: "7F3B9K2D" });
  });

  test("catches typos before they reach the gate check", () => {
    expect(normaliseCode("   ")).toEqual({ error: "Enter the pickup code." });
    expect(normaliseCode("7F3B9K2")).toEqual({ error: "Codes are 8 characters long. Check the code and try again." });
    expect(normaliseCode("7F3B9K2D9")).toEqual({ error: "Codes are 8 characters long. Check the code and try again." });
    for (const typo of ["0F3B9K2D", "1F3B9K2D", "IF3B9K2D", "OF3B9K2D", "7F3B9K2#"]) {
      expect(normaliseCode(typo)).toEqual({
        error: "Codes use letters and numbers only, never 0, 1, I or O. Check the code and try again.",
      });
    }
  });
});

test("every failed result has gate text, and an unknown one has a fallback", () => {
  const failures: CheckResult[] = [
    "invalid_code",
    "wrong_pupil",
    "wrong_authorisation",
    "used_code",
    "expired_code",
    "authorisation_inactive",
    "authorisation_pending",
    "authorisation_scheduled",
    "authorisation_expired",
  ];
  for (const result of failures) expect(failureText(result).title).not.toBe("Check failed");
  expect(failureText("something_new" as CheckResult).title).toBe("Check failed");
});
