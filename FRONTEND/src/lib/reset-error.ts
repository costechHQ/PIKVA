/**
 * Messages and checks for the forgot-password and reset-password forms
 * (SRS 6.6). Safe to import from pages.
 */
import { UNAVAILABLE, detailText, tooManyMessage } from "@/lib/api-errors";

export const RESET_LINK_INVALID = "This reset link is invalid or has expired";

// Same rules as FastAPI's Password field (SRS 6.2): 1-128 characters, not
// all spaces. Spaces inside a password are kept.
export const PASSWORD_MAX_LENGTH = 128;

/** Message for a failed POST /api/auth/password-reset/request. */
export function forgotErrorMessage(status: number, body: unknown, retryAfter: string | null): string {
  if (status === 422) return "Enter a valid email address.";
  if (status === 429) return tooManyMessage("reset requests", retryAfter);
  if (status === 502 || status === 503) return detailText(body) ?? UNAVAILABLE;
  return "Could not send the reset link. Please try again.";
}

/** Message for a failed POST /api/auth/password-reset/confirm. */
export function resetErrorMessage(status: number, body: unknown, retryAfter: string | null): string {
  if (status === 400) return detailText(body) ?? RESET_LINK_INVALID;
  // The page checks the password first, so a 422 here means a mangled token.
  if (status === 422) return RESET_LINK_INVALID;
  if (status === 429) return tooManyMessage("attempts", retryAfter);
  if (status === 502 || status === 503) return detailText(body) ?? UNAVAILABLE;
  return "Could not reset your password. Please try again.";
}

/** Check the new password on the page; return a message, or null if fine. */
export function newPasswordProblem(password: string, confirmation: string): string | null {
  if (!password.trim()) return "Enter a new password.";
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}

/** Return whether a value has the shape of a reset token from the email. */
export function isResetTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(token);
}
