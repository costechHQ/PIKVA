/**
 * Browser-side calls the web app makes through /api/proxy (parent portal
 * SRS 18.9, admin pages).
 * Turns every answer into either the JSON body or a message for the page.
 */
import { OFFLINE, UNAVAILABLE, detailText, tooManyMessage } from "@/lib/api-errors";
import type { PickupPerson } from "@/lib/parent";
import { PHOTO_TOO_LARGE, photoPath } from "@/lib/photos";
import { LOGIN_PATH } from "@/lib/roles";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * The message for a failed answer. A 422 shows FastAPI's own message when it
 * is a sentence (such as "Expiry time must be after start time"); a field
 * validation list becomes a general prompt.
 */
export function actionErrorMessage(status: number, body: unknown, notFound: string): string {
  if (status === 404) return notFound;
  if (status === 422 || status === 400) return detailText(body) ?? "Check the details and try again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 409) return detailText(body) ?? "This was changed by someone else. Reload the page and try again.";
  if (status === 413) return detailText(body) ?? PHOTO_TOO_LARGE;
  return UNAVAILABLE;
}

/**
 * Send a request to FastAPI /api/v1/<path> as the signed-in user. A 401
 * (session ended) goes to the login page. notFound is the message for a 404,
 * which FastAPI also gives for records that belong to someone else; a 429
 * says "Too many <tooManyWhat>" with the wait from Retry-After.
 */
export async function sendAsUser<T>(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  notFound: string,
  tooManyWhat = "requests",
): Promise<ActionResult<T>> {
  let response: Response;

  try {
    response = await fetch(`/api/proxy/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: OFFLINE };
  }

  return actionResult<T>(response, notFound, tooManyWhat);
}

const PERSON_GONE = "This pickup person is no longer linked to your account.";

/**
 * Upload (file) or remove (null) a pickup person's photo (SRS 9.3). The
 * answer is the updated person, whose status may now be pending_approval.
 */
export async function sendPhoto(personId: number, file: File | null): Promise<ActionResult<PickupPerson>> {
  let response: Response;

  try {
    if (file) {
      const form = new FormData();
      form.append("photo", file);
      response = await fetch(photoPath(personId), { method: "PUT", body: form });
    } else {
      response = await fetch(photoPath(personId), { method: "DELETE" });
    }
  } catch {
    return { ok: false, message: OFFLINE };
  }

  return actionResult<PickupPerson>(response, PERSON_GONE, "photo changes");
}

/** Turn an answer into its JSON body or a message, as sendAsUser describes. */
async function actionResult<T>(response: Response, notFound: string, tooManyWhat: string): Promise<ActionResult<T>> {
  if (response.status === 401) {
    window.location.assign(LOGIN_PATH);
    return { ok: false, message: "Your session has ended. Please sign in again." };
  }

  if (response.status === 429) {
    return { ok: false, message: tooManyMessage(tooManyWhat, response.headers.get("retry-after")) };
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, message: actionErrorMessage(response.status, json, notFound) };
  }

  return { ok: true, data: json as T };
}
