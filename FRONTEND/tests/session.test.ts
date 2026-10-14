/** Tests for the session cookie helpers (httpOnly JWT cookie, never readable by browser JS). */
import { describe, expect, test } from "bun:test";

import {
  SESSION_COOKIE,
  clearedSessionCookie,
  secondsUntilExpiry,
  sessionCookie,
  sessionToken,
} from "@/lib/session";
import { fakeRequest, tokenExpiringIn } from "./helpers";

describe("sessionCookie", () => {
  const token = tokenExpiringIn(1800);

  test("stores the token httpOnly, SameSite=Strict, site-wide", () => {
    const cookie = sessionCookie(token, 1800, false);

    expect(cookie).toBe(`${SESSION_COOKIE}=${token}; Path=/; Max-Age=1800; HttpOnly; SameSite=Strict`);
  });

  test("adds Secure only when asked (production)", () => {
    expect(sessionCookie(token, 1800, true)).toEndWith("; Secure");
    expect(sessionCookie(token, 1800, false)).not.toContain("Secure");
  });

  test("refuses values that could inject cookie attributes", () => {
    expect(() => sessionCookie("abc; Domain=evil.example", 60, false)).toThrow();
    expect(() => sessionCookie("not-a-jwt", 60, false)).toThrow();
  });
});

test("clearedSessionCookie expires the cookie immediately", () => {
  expect(clearedSessionCookie(false)).toBe(
    `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
  );
});

describe("sessionToken", () => {
  test("reads the token from the session cookie", () => {
    const token = tokenExpiringIn(60);

    expect(sessionToken(fakeRequest({ method: "GET", cookies: { [SESSION_COOKIE]: token } }))).toBe(token);
  });

  test("returns null without a cookie", () => {
    expect(sessionToken(fakeRequest({ method: "GET" }))).toBeNull();
  });
});

describe("secondsUntilExpiry", () => {
  test("reads the exp claim", () => {
    const seconds = secondsUntilExpiry(tokenExpiringIn(1800));

    expect(seconds).toBeGreaterThan(1795);
    expect(seconds).toBeLessThanOrEqual(1800);
  });

  test("returns null for an unreadable token", () => {
    expect(secondsUntilExpiry("a.b.c")).toBeNull();
  });
});
