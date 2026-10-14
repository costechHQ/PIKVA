/**
 * Server-side page guard. Call requireUser from getServerSideProps so a
 * protected page is never rendered for someone signed out or with the wrong
 * role (SRS 18.2).
 */
import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";

import { apiBaseUrl } from "@/lib/config";
import { clearedSessionCookie, secureCookies, sessionToken } from "@/lib/session";

// Exactly the values FastAPI sends (UserRole in app/models/user.py).
export type Role = "school_admin" | "gate_staff" | "parent";

/** The signed-in user, as FastAPI GET /api/v1/auth/me returns it. */
export type CurrentUser = {
  id: number;
  school_id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  school_name: string;
};

export const LOGIN_PATH = "/login";

// Where each role belongs. Parents get no web functionality, only a page
// pointing them to the mobile app.
export const HOME_PATH: Record<Role, string> = {
  school_admin: "/admin",
  gate_staff: "/gate",
  parent: "/use-mobile-app",
};

type GuardContext = Pick<GetServerSidePropsContext, "req" | "res">;

/**
 * Return { props: { user } } when the signed-in user has one of the allowed
 * roles; otherwise a redirect to /login (signed out or token rejected, which
 * also deletes the cookie) or to the user's own home page. Throws when
 * FastAPI is unreachable or fails, so Next.js shows its error page.
 */
export async function requireUser(
  context: GuardContext,
  allowed: readonly Role[],
): Promise<GetServerSidePropsResult<{ user: CurrentUser }>> {
  const token = sessionToken(context.req);

  if (!token) {
    return redirect(LOGIN_PATH);
  }

  const response = await fetch(`${apiBaseUrl()}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    context.res.setHeader("Set-Cookie", clearedSessionCookie(secureCookies()));
    return redirect(LOGIN_PATH);
  }

  if (!response.ok) {
    throw new Error(`Could not load the signed-in user (FastAPI answered ${response.status})`);
  }

  const user: CurrentUser = await response.json();

  if (!allowed.includes(user.role)) {
    return redirect(HOME_PATH[user.role] ?? LOGIN_PATH);
  }

  return { props: { user } };
}

function redirect(destination: string): GetServerSidePropsResult<never> {
  return { redirect: { destination, permanent: false } };
}
