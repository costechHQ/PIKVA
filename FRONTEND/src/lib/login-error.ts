/**
 * Turn a failed POST /api/auth/login answer into one sentence for the login
 * form. Safe to import from pages.
 */

const GENERIC = "Sign-in failed. Please try again.";

/**
 * Return the message to show for a failed sign-in.
 *
 * 401 keeps FastAPI's own wording ("Invalid email or password"), which never
 * reveals whether the email exists. 429 says how long to wait when FastAPI
 * sent Retry-After. 422 bodies from FastAPI are lists of field errors, so
 * they get a plain sentence instead.
 */
export function loginErrorMessage(status: number, body: unknown, retryAfter: string | null): string {
  if (status === 401) {
    return detailText(body) ?? "Invalid email or password";
  }

  if (status === 422) {
    return "Enter a valid email address and your password.";
  }

  if (status === 429) {
    const minutes = waitMinutes(retryAfter);
    return minutes === null
      ? "Too many sign-in attempts. Please wait and try again."
      : `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }

  if (status === 502 || status === 503) {
    return detailText(body) ?? "Pikva service is unavailable. Try again shortly.";
  }

  return GENERIC;
}

/** Return body.detail when it is a non-empty string. */
function detailText(body: unknown): string | null {
  if (body && typeof body === "object" && "detail" in body) {
    const { detail } = body as { detail: unknown };
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return null;
}

/** Retry-After seconds rounded up to whole minutes, or null if unusable. */
function waitMinutes(retryAfter: string | null): number | null {
  const seconds = Number(retryAfter);
  return retryAfter && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : null;
}
