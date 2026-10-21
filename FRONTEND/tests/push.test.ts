/** Tests for the push notification helpers (SRS 13). */
import { describe, expect, test } from "bun:test";

import { subscriptionBody, urlBase64ToUint8Array } from "@/lib/push";

describe("urlBase64ToUint8Array", () => {
  test("decodes URL-safe base64 without padding", () => {
    // "hello?>" in standard base64 is aGVsbG8/Pg==; URL-safe and unpadded: aGVsbG8_Pg
    const bytes = urlBase64ToUint8Array("aGVsbG8_Pg");

    expect(Array.from(bytes)).toEqual([...new TextEncoder().encode("hello?>")]);
  });

  test("decodes a 65-byte public key to 65 bytes", () => {
    const key = "BO0iYfsVMBcr1Uts_y5B20QjQmcIwYvGmZ0uJfJf7RkQ0X9Qd3zHkq0cV8m5Yb1yq5tqkq0q8xY5r8z3yq0cV8m";
    expect(urlBase64ToUint8Array(key.slice(0, 87)).length).toBe(65);
  });
});

describe("subscriptionBody", () => {
  test("keeps only the endpoint and the two keys", () => {
    expect(
      subscriptionBody({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "k", auth: "a" }, expirationTime: null } as never),
    ).toEqual({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "k", auth: "a" } });
  });

  test("is null when the browser's subscription is incomplete", () => {
    expect(subscriptionBody({})).toBeNull();
    expect(subscriptionBody({ endpoint: "https://x", keys: { p256dh: "k" } })).toBeNull();
    expect(subscriptionBody({ endpoint: "", keys: { p256dh: "k", auth: "a" } })).toBeNull();
  });
});
