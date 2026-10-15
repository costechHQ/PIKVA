/** Tests for POST /api/auth/change-password (SRS 6.8): the new token goes into the cookie only. */
import { afterEach, describe, expect, test } from "bun:test";

import changePassword from "@/pages/api/auth/change-password";
import { SESSION_COOKIE } from "@/lib/session";
import { type FakeBackend, fakeRequest, fakeResponse, startBackend, tokenExpiringIn } from "./helpers";

const OLD_TOKEN = tokenExpiringIn(1800);
const BODY = { current_password: "Old-password-1", new_password: "New-password-2" };

let backend: FakeBackend | undefined;

afterEach(() => backend?.stop());

function useBackend(reply: () => Response): FakeBackend {
  backend = startBackend(reply);
  process.env.PIKVA_API_URL = backend.url;
  return backend;
}

async function post(body: unknown = BODY, cookies: Record<string, string> = { [SESSION_COOKIE]: OLD_TOKEN }) {
  const res = fakeResponse();
  await changePassword(fakeRequest({ method: "POST", body, cookies }), res);
  return res;
}

describe("POST /api/auth/change-password", () => {
  test("sends the session's token and swaps in the new one, never returning it", async () => {
    const fresh = tokenExpiringIn(1800);
    const fake = useBackend(() => Response.json({ access_token: fresh, token_type: "bearer" }));

    const res = await post();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(res.body).not.toContain(fresh);
    expect(res.headers["set-cookie"]).toStartWith(`${SESSION_COOKIE}=${fresh}; Path=/; Max-Age=`);

    const [call] = fake.requests;
    expect(call.path).toBe("/api/v1/auth/change-password");
    expect(call.headers.get("authorization")).toBe(`Bearer ${OLD_TOKEN}`);
    expect(JSON.parse(call.body)).toEqual(BODY);
  });

  test("passes a wrong current password through and keeps the session", async () => {
    useBackend(() => Response.json({ detail: "Your current password is not correct" }, { status: 400 }));

    const res = await post();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).detail).toBe("Your current password is not correct");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("passes 429 with Retry-After through", async () => {
    useBackend(() => Response.json({ detail: "Too many" }, { status: 429, headers: { "Retry-After": "600" } }));

    const res = await post();

    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("600");
  });

  test("an ended session clears the cookie", async () => {
    useBackend(() => Response.json({ detail: "Invalid or expired token" }, { status: 401 }));

    const res = await post();

    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toStartWith(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  });

  test("needs a session and both passwords, without calling FastAPI", async () => {
    const fake = useBackend(() => Response.json({}));

    expect((await post(BODY, {})).statusCode).toBe(401);
    expect((await post({ current_password: "x" })).statusCode).toBe(422);
    expect(fake.requests).toHaveLength(0);
  });
});
