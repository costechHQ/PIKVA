/**
 * Turn a failed POST /api/auth/login answer into one sentence for the login
 * form. Safe to import from pages.
 */
import { UNAVAILABLE, detailText, tooManyMessage } from "@/lib/api-errors";

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
    return tooManyMessage("sign-in attempts", retryAfter);
  }

  if (status === 502 || status === 503) {
    return detailText(body) ?? UNAVAILABLE;
  }

  return "Sign-in failed. Please try again.";
}
