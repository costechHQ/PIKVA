/** Tests for POST /api/auth/login and /api/auth/logout (the browser never receives the JWT). */
import { afterEach, describe, expect, test } from "bun:test";

import login from "@/pages/api/auth/login";
import logout from "@/pages/api/auth/logout";
import { SESSION_COOKIE } from "@/lib/session";
import {
  type FakeBackend,
  deadBackendUrl,
  fakeRequest,
  fakeResponse,
  startBackend,
  tokenExpiringIn,
} from "./helpers";

const CREDENTIALS = { email: "admin@school.example", password: "TestPassword123!" };

let backend: FakeBackend | undefined;

afterEach(() => backend?.stop());

/** Point the routes at a fake FastAPI that answers every request with reply. */
function useBackend(reply: () => Response): FakeBackend {
  backend = startBackend(reply);
  process.env.PIKVA_API_URL = backend.url;
  return backend;
}

async function postLogin(body: unknown = CREDENTIALS, ip = "203.0.113.9") {
  const res = fakeResponse();
  await login(fakeRequest({ method: "POST", body, ip }), res);
  return res;
}

describe("POST /api/auth/login", () => {
  test("sets the session cookie and never returns the token", async () => {
    const token = tokenExpiringIn(1800);
    const fake = useBackend(() => Response.json({ access_token: token, token_type: "bearer" }));

    const res = await postLogin();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(res.body).not.toContain(token);
    expect(res.headers["set-cookie"]).toStartWith(`${SESSION_COOKIE}=${token}; Path=/; Max-Age=`);
    expect(res.headers["set-cookie"]).toContain("HttpOnly; SameSite=Strict");

    const [call] = fake.requests;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/api/v1/auth/login");
    expect(JSON.parse(call.body)).toEqual(CREDENTIALS);
  });

  test("cookie lasts as long as the token", async () => {
    useBackend(() => Response.json({ access_token: tokenExpiringIn(600), token_type: "bearer" }));

    const maxAge = Number((await postLogin()).headers["set-cookie"].match(/Max-Age=(\d+)/)?.[1]);

    expect(maxAge).toBeGreaterThan(595);
    expect(maxAge).toBeLessThanOrEqual(600);
  });

  test("passes the browser's IP to FastAPI for per-IP limits", async () => {
    const fake = useBackend(() => Response.json({ access_token: tokenExpiringIn(60) }));

    await postLogin(CREDENTIALS, "198.51.100.23");

    expect(fake.requests[0].headers.get("x-forwarded-for")).toBe("198.51.100.23");
  });

  test("passes FastAPI's 401 through without a cookie", async () => {
    useBackend(() => Response.json({ detail: "Invalid email or password" }, { status: 401 }));

    const res = await postLogin();

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ detail: "Invalid email or password" });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("passes 429 through with Retry-After", async () => {
    useBackend(
      () =>
        Response.json(
          { detail: "Too many requests. Try again later." },
          { status: 429, headers: { "Retry-After": "120" } },
        ),
    );

    const res = await postLogin();

    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("120");
  });

  test("rejects a body without string email and password, without calling FastAPI", async () => {
    const fake = useBackend(() => Response.json({}));

    const res = await postLogin({ email: "admin@school.example" });

    expect(res.statusCode).toBe(422);
    expect(fake.requests).toHaveLength(0);
  });

  test("allows only POST", async () => {
    const res = fakeResponse();

    await login(fakeRequest({ method: "GET" }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("POST");
  });

  test("answers 502 when FastAPI is unreachable", async () => {
    process.env.PIKVA_API_URL = deadBackendUrl();

    const res = await postLogin();

    expect(res.statusCode).toBe(502);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("POST /api/auth/logout", () => {
  test("clears the session cookie", async () => {
    const res = fakeResponse();

    await logout(fakeRequest({ method: "POST" }), res);

    expect(res.statusCode).toBe(204);
    expect(res.headers["set-cookie"]).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  });

  test("allows only POST", async () => {
    const res = fakeResponse();

    await logout(fakeRequest({ method: "GET" }), res);

    expect(res.statusCode).toBe(405);
  });
});
