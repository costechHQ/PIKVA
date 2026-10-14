import { LOGIN_PATH } from "@/lib/roles";

/**
 * Delete the session cookie, then do a full page load to /login so no
 * signed-in page state survives in memory. Goes to /login even if the
 * request fails.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.assign(LOGIN_PATH);
  }
}
