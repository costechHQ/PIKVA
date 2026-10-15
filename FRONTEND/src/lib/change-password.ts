/**
 * Change password while signed in (SRS 6.8): form checks and messages for
 * the shared form. Safe to import from pages.
 */
import { UNAVAILABLE, detailText, tooManyMessage } from "@/lib/api-errors";

export type PasswordChangeForm = { current: string; next: string; confirm: string };

// The backend's Password rule (SRS 6.2): 1-128 characters, not all spaces.
const PASSWORD_MAX = 128;

/** Check the form and return the request body, or the first problem. */
export function passwordChangeBody(
  form: PasswordChangeForm,
): { body: { current_password: string; new_password: string } } | { error: string } {
  if (!form.current) return { error: "Enter your current password." };
  if (!form.next.trim()) return { error: "Enter a new password." };
  if (form.next.length > PASSWORD_MAX) return { error: `The new password can be at most ${PASSWORD_MAX} characters.` };
  if (form.next === form.current) return { error: "The new password must be different from your current one." };
  if (form.next !== form.confirm) return { error: "The two new passwords do not match." };
  return { body: { current_password: form.current, new_password: form.next } };
}

/** The message for a failed change. 401 means the session ended (the caller signs in again). */
export function passwordChangeError(status: number, body: unknown, retryAfter: string | null): string {
  if (status === 400) return detailText(body) ?? "Your current password is not correct.";
  if (status === 422) return "Check the passwords and try again.";
  if (status === 429) return tooManyMessage("password attempts", retryAfter);
  if (status === 401) return "Your session has ended. Please sign in again.";
  return UNAVAILABLE;
}
