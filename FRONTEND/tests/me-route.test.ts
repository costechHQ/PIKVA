/** Tests for GET /api/auth/me (reads the session cookie, never exposes the JWT). */
import { afterEach, describe, expect, test } from "bun:test";

import me from "@/pages/api/auth/me";
import { SESSION_COOKIE } from "@/lib/session";
import {
  type FakeBackend,
  deadBackendUrl,
  fakeRequest,
  fakeResponse,
  startBackend,
  tokenExpiringIn,
} from "./helpers";

const USER = {
  id: 7,
  school_id: 3,
  name: "Ada Admin",
  email: "admin@school.example",
  phone: null,
  role: "school_admin",
  school_name: "Sunrise School",
};

let backend: FakeBackend | undefined;

afterEach(() => backend?.stop());

/** Point the route at a fake FastAPI that answers every request with reply. */
function useBackend(reply: () => Response): FakeBackend {
  backend = startBackend(reply);
  process.env.PIKVA_API_URL = backend.url;
  return backend;
}

async function getMe(cookies: Record<string, string> = {}) {
  const res = fakeResponse();
  await me(fakeRequest({ method: "GET", cookies }), res);
  return res;
}

describe("GET /api/auth/me", () => {
  test("sends the cookie's token as a Bearer header and returns the user", async () => {
    const token = tokenExpiringIn(1800);
    const fake = useBackend(() => Response.json(USER));

    const res = await getMe({ [SESSION_COOKIE]: token });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(USER);
    expect(res.body).not.toContain(token);
    expect(res.headers["set-cookie"]).toBeUndefined();

    const [call] = fake.requests;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/api/v1/auth/me");
    expect(call.headers.get("authorization")).toBe(`Bearer ${token}`);
  });

  test("answers 401 without a cookie and does not call FastAPI", async () => {
    const fake = useBackend(() => Response.json(USER));

    const res = await getMe();

    expect(res.statusCode).toBe(401);
    expect(fake.requests).toHaveLength(0);
  });

  test("clears the cookie when FastAPI rejects the token", async () => {
    useBackend(() => Response.json({ detail: "Could not validate credentials" }, { status: 401 }));

    const res = await getMe({ [SESSION_COOKIE]: tokenExpiringIn(-60) });

    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  });

  test("keeps the cookie when FastAPI fails for another reason", async () => {
    useBackend(() => Response.json({ detail: "Internal Server Error" }, { status: 500 }));

    const res = await getMe({ [SESSION_COOKIE]: tokenExpiringIn(1800) });

    expect(res.statusCode).toBe(500);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("answers 502 when FastAPI is unreachable", async () => {
    process.env.PIKVA_API_URL = deadBackendUrl();

    const res = await getMe({ [SESSION_COOKIE]: tokenExpiringIn(1800) });

    expect(res.statusCode).toBe(502);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("allows only GET and PATCH", async () => {
    const res = fakeResponse();

    await me(fakeRequest({ method: "POST" }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("GET, PATCH");
  });
});

describe("PATCH /api/auth/me (SRS 6.9)", () => {
  test("passes on only name and phone, with the session's token", async () => {
    const token = tokenExpiringIn(1800);
    const fake = useBackend(() => Response.json({ ...USER, name: "Ada Okafor" }));
    const res = fakeResponse();

    await me(
      fakeRequest({
        method: "PATCH",
        cookies: { [SESSION_COOKIE]: token },
        body: { name: "Ada Okafor", phone: "0700000000", email: "sneaky@example.com", role: "parent" },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe("Ada Okafor");
    const [call] = fake.requests;
    expect(call.method).toBe("PATCH");
    expect(call.headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(call.body)).toEqual({ name: "Ada Okafor", phone: "0700000000" });
  });

  test("needs a session", async () => {
    const res = fakeResponse();
    await me(fakeRequest({ method: "PATCH", body: { name: "X" } }), res);
    expect(res.statusCode).toBe(401);
  });
});
