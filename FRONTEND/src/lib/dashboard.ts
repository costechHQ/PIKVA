/**
 * Admin dashboard (SRS 18.3): summary helpers for /admin, built from the
 * existing list endpoints. Safe to import from pages.
 */

/** Most rows the dashboard reads per list (FastAPI's largest page for releases and alerts). */
export const DASHBOARD_LIMIT = 200;

/** How many items each dashboard panel lists. */
export const PANEL_SIZE = 5;

/**
 * A count read from at most `limit` rows: "200+" when the list was full,
 * since the real total may be higher.
 */
export function countText(count: number, limit: number = DASHBOARD_LIMIT): string {
  return count >= limit ? `${limit}+` : String(count);
}

/**
 * Whether every row the dashboard read fell on today, so older rows from
 * today may have been cut off and the count is a lower bound.
 */
export function mayHaveMore(todayCount: number, readCount: number, limit: number = DASHBOARD_LIMIT): boolean {
  return readCount >= limit && todayCount === readCount;
}
