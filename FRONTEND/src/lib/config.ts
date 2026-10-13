/**
 * Server-side configuration. Import only from API routes or other server
 * code: PIKVA_API_URL has no NEXT_PUBLIC_ prefix, so it is never sent to the
 * browser and the browser never talks to FastAPI directly.
 */

/** Return the FastAPI base URL (for example http://127.0.0.1:8000). */
export function apiBaseUrl(): string {
  const url = process.env.PIKVA_API_URL;

  if (!url) {
    throw new Error("PIKVA_API_URL is not set; see FRONTEND/.env.example");
  }

  return url.replace(/\/+$/, "");
}
