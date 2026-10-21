import { describe, expect, test } from "bun:test";

import { contentSecurityPolicy, newNonce } from "@/lib/csp";

const directives = (policy: string) =>
  Object.fromEntries(policy.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1).join(" ")]));

describe("contentSecurityPolicy", () => {
  test("production: only nonce'd scripts and styles, no inline or eval", () => {
    const p = directives(contentSecurityPolicy("abc123", false));

    expect(p["script-src"]).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
    expect(p["style-src"]).toBe("'self' 'nonce-abc123'");
    expect(contentSecurityPolicy("abc123", false)).not.toContain("unsafe");
    expect(p["object-src"]).toBe("'none'");
    expect(p["worker-src"]).toBe("'self'");
    expect(p["frame-ancestors"]).toBe("'none'");
    expect(p["base-uri"]).toBe("'self'");
    expect("upgrade-insecure-requests" in p).toBe(true);
  });

  test("development loosens only eval and styles", () => {
    const p = directives(contentSecurityPolicy("abc123", true));

    expect(p["script-src"]).toBe("'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval'");
    expect(p["style-src"]).toBe("'self' 'unsafe-inline'");
    expect("upgrade-insecure-requests" in p).toBe(false);
  });

  test("photos from https hosts are allowed, plain http is not", () => {
    expect(directives(contentSecurityPolicy("n", false))["img-src"]).toBe("'self' https: data: blob:");
  });
});

test("newNonce is random base64 of 16 bytes", () => {
  const nonces = new Set(Array.from({ length: 50 }, newNonce));
  expect(nonces.size).toBe(50);
  for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
});
