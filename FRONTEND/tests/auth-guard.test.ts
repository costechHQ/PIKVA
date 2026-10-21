/** Tests for requireUser, the getServerSideProps page guard. */
import { afterEach, describe, expect, test } from "bun:test";

import { BackendError, type CurrentUser, type Role, getAsUser, getOptionalUser, redirectIfSignedIn, requireUser } from "@/lib/auth-guard";
import { SESSION_COOKIE } from "@/lib/session";
import { type FakeBackend, deadBackendUrl, startBackend, tokenExpiringIn } from "./helpers";

const TOKEN = tokenExpiringIn(1800);

let backend: FakeBackend | undefined;

afterEach(() => backend?.stop());

function userWithRole(role: Role): CurrentUser {
  return {
    id: 7,
    school_id: 3,
    name: "Sam Staff",
    email: "staff@school.example",
    phone: null,
    role,
    school_name: "Sunrise School",
  };
}

/** Point the guard at a fake FastAPI that answers every request with reply. */
function useBackend(reply: () => Response): FakeBackend {
  backend = startBackend(reply);
  process.env.PIKVA_API_URL = backend.url;
  return backend;
}

/** Build the parts of a getServerSideProps context the guard uses. */
function fakeContext(cookies: Record<string, string> = { [SESSION_COOKIE]: TOKEN }) {
  const headers: Record<string, string> = {};
  const context = {
    req: { cookies },
    res: {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
    },
  } as unknown as Parameters<typeof requireUser>[0];

  return { context, headers };
}

describe("requireUser", () => {
  test("returns the user as props when the role is allowed", async () => {
    const user = userWithRole("school_admin");
    const fake = useBackend(() => Response.json(user));
    const { context } = fakeContext();

    const result = await requireUser(context, ["school_admin"]);

    expect(result).toEqual({ props: { user } });
    expect(fake.requests[0].path).toBe("/api/v1/auth/me");
    expect(fake.requests[0].headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  test("redirects to /login without a cookie and does not call FastAPI", async () => {
    const fake = useBackend(() => Response.json(userWithRole("school_admin")));
    const { context } = fakeContext({});

    const result = await requireUser(context, ["school_admin"]);

    expect(result).toEqual({ redirect: { destination: "/login", permanent: false } });
    expect(fake.requests).toHaveLength(0);
  });

  test("clears the cookie and redirects to /login when FastAPI rejects the token", async () => {
    useBackend(() => Response.json({ detail: "Could not validate credentials" }, { status: 401 }));
    const { context, headers } = fakeContext();

    const result = await requireUser(context, ["school_admin"]);

    expect(result).toEqual({ redirect: { destination: "/login", permanent: false } });
    expect(headers["set-cookie"]).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  });

  test("sends a parent on a staff page to the parent portal", async () => {
    useBackend(() => Response.json(userWithRole("parent")));

    const result = await requireUser(fakeContext().context, ["school_admin", "gate_staff"]);

    expect(result).toEqual({ redirect: { destination: "/parent", permanent: false } });
  });

  test("sends gate staff on an admin page to the gate page", async () => {
    useBackend(() => Response.json(userWithRole("gate_staff")));

    const result = await requireUser(fakeContext().context, ["school_admin"]);

    expect(result).toEqual({ redirect: { destination: "/gate", permanent: false } });
  });

  test("sends an admin on a gate page to the admin page", async () => {
    useBackend(() => Response.json(userWithRole("school_admin")));

    const result = await requireUser(fakeContext().context, ["gate_staff"]);

    expect(result).toEqual({ redirect: { destination: "/admin", permanent: false } });
  });

  test("sends a user with an unknown role to /login", async () => {
    useBackend(() => Response.json({ ...userWithRole("school_admin"), role: "SCHOOL_ADMIN" }));

    const result = await requireUser(fakeContext().context, ["school_admin"]);

    expect(result).toEqual({ redirect: { destination: "/login", permanent: false } });
  });

  test("throws when FastAPI fails, so Next.js shows its error page", async () => {
    useBackend(() => Response.json({ detail: "Internal Server Error" }, { status: 500 }));

    await expect(requireUser(fakeContext().context, ["school_admin"])).rejects.toThrow("500");
  });

  test("throws when FastAPI is unreachable", async () => {
    process.env.PIKVA_API_URL = deadBackendUrl();

    await expect(requireUser(fakeContext().context, ["school_admin"])).rejects.toThrow();
  });
});

describe("redirectIfSignedIn", () => {
  const SHOW_PAGE = { props: {} };

  test("sends a signed-in admin to /admin", async () => {
    useBackend(() => Response.json(userWithRole("school_admin")));

    expect(await redirectIfSignedIn(fakeContext().context)).toEqual({
      redirect: { destination: "/admin", permanent: false },
    });
  });

  test("sends signed-in gate staff and parents to their own pages", async () => {
    useBackend(() => Response.json(userWithRole("gate_staff")));
    expect(await redirectIfSignedIn(fakeContext().context)).toEqual({
      redirect: { destination: "/gate", permanent: false },
    });
    backend?.stop();

    useBackend(() => Response.json(userWithRole("parent")));
    expect(await redirectIfSignedIn(fakeContext().context)).toEqual({
      redirect: { destination: "/parent", permanent: false },
    });
  });

  test("shows the page without a cookie and does not call FastAPI", async () => {
    const fake = useBackend(() => Response.json(userWithRole("school_admin")));

    expect(await redirectIfSignedIn(fakeContext({}).context)).toEqual(SHOW_PAGE);
    expect(fake.requests).toHaveLength(0);
  });

  test("clears a rejected cookie and shows the page", async () => {
    useBackend(() => Response.json({ detail: "Could not validate credentials" }, { status: 401 }));
    const { context, headers } = fakeContext();

    expect(await redirectIfSignedIn(context)).toEqual(SHOW_PAGE);
    expect(headers["set-cookie"]).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  });

  test("shows the page when FastAPI fails or is unreachable", async () => {
    useBackend(() => Response.json({ detail: "Internal Server Error" }, { status: 500 }));
    expect(await redirectIfSignedIn(fakeContext().context)).toEqual(SHOW_PAGE);
    backend?.stop();

    process.env.PIKVA_API_URL = deadBackendUrl();
    expect(await redirectIfSignedIn(fakeContext().context)).toEqual(SHOW_PAGE);
  });

  test("shows the page for an unknown role instead of looping", async () => {
    useBackend(() => Response.json({ ...userWithRole("school_admin"), role: "SCHOOL_ADMIN" }));

    expect(await redirectIfSignedIn(fakeContext().context)).toEqual(SHOW_PAGE);
  });
});

describe("getAsUser", () => {
  test("GETs the /api/v1 path with the session's Bearer token", async () => {
    const fake = useBackend(() => Response.json([{ id: 1 }]));

    const rows = await getAsUser<{ id: number }[]>(fakeContext().context, "schools/users?limit=51&offset=0");

    expect(rows).toEqual([{ id: 1 }]);
    expect(fake.requests[0].path).toBe("/api/v1/schools/users?limit=51&offset=0");
    expect(fake.requests[0].headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  test("throws when FastAPI fails, so the page shows an error, not an empty list", async () => {
    useBackend(() => Response.json({ detail: "Forbidden" }, { status: 403 }));

    await expect(getAsUser(fakeContext().context, "schools/users")).rejects.toThrow("403");
  });

  test("the error carries FastAPI's status, so a page can answer 404 with notFound", async () => {
    useBackend(() => Response.json({ detail: "Pupil not found" }, { status: 404 }));

    const error = await getAsUser(fakeContext().context, "pupils/99").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BackendError);
    expect((error as BackendError).status).toBe(404);
  });

  test("throws without a session", async () => {
    await expect(getAsUser(fakeContext({}).context, "schools/users")).rejects.toThrow();
  });
});

describe("getOptionalUser", () => {
  test("returns the signed-in user, whatever their role", async () => {
    const user = userWithRole("parent");
    useBackend(() => Response.json(user));

    expect(await getOptionalUser(fakeContext().context)).toEqual(user);
  });

  test("returns null without a cookie and does not call FastAPI", async () => {
    const fake = useBackend(() => Response.json(userWithRole("school_admin")));

    expect(await getOptionalUser(fakeContext({}).context)).toBeNull();
    expect(fake.requests).toHaveLength(0);
  });

  test("clears a rejected cookie and returns null", async () => {
    useBackend(() => Response.json({ detail: "Could not validate credentials" }, { status: 401 }));
    const { context, headers } = fakeContext();

    expect(await getOptionalUser(context)).toBeNull();
    expect(headers["set-cookie"]).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  });

  test("returns null when FastAPI fails, is unreachable, or sends an unknown role", async () => {
    useBackend(() => Response.json({ detail: "Internal Server Error" }, { status: 500 }));
    expect(await getOptionalUser(fakeContext().context)).toBeNull();
    backend?.stop();

    process.env.PIKVA_API_URL = deadBackendUrl();
    expect(await getOptionalUser(fakeContext().context)).toBeNull();

    useBackend(() => Response.json({ ...userWithRole("parent"), role: "superuser" }));
    expect(await getOptionalUser(fakeContext().context)).toBeNull();
  });
});
