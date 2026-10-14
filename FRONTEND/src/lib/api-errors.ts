/**
 * Helpers for turning FastAPI error answers into form messages. Safe to
 * import from pages.
 */

export const UNAVAILABLE = "Pikva service is unavailable. Try again shortly.";
export const OFFLINE = "Could not reach Pikva. Check your connection and try again.";

/** Return body.detail when it is a non-empty string. */
export function detailText(body: unknown): string | null {
  if (body && typeof body === "object" && "detail" in body) {
    const { detail } = body as { detail: unknown };
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return null;
}

/** "Too many <what>. Try again in N minutes." from a Retry-After header. */
export function tooManyMessage(what: string, retryAfter: string | null): string {
  const seconds = Number(retryAfter);

  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) {
    return `Too many ${what}. Please wait and try again.`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `Too many ${what}. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
