/**
 * Security alerts for admins (SRS 13, 18.7): FastAPI shapes, filters and
 * labels for /admin/alerts. Safe to import from pages.
 */

/** An alert as GET /api/v1/alerts returns it. People are referred to by ID only. */
export type SecurityAlert = {
  id: number;
  pupil_id: number | null;
  authorisation_id: number | null;
  attempted_by: number | null;
  alert_type: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  status: "open" | "resolved";
};

export type AlertFilter = "open" | "resolved" | "all";

export const ALERT_FILTERS: readonly { label: string; filter: AlertFilter }[] = [
  { label: "Open", filter: "open" },
  { label: "Resolved", filter: "resolved" },
  { label: "All", filter: "all" },
];

export const ALERTS_PAGE_SIZE = 25;

/** The ?status= filter; anything else means open, the alerts that need attention. */
export function parseAlertFilter(value: unknown): AlertFilter {
  return value === "resolved" || value === "all" ? value : "open";
}

/** FastAPI path for one page, asking for one extra row to know if there is a next page. */
export function alertsApiPath(filter: AlertFilter, page: number): string {
  const params = new URLSearchParams({
    limit: String(ALERTS_PAGE_SIZE + 1),
    offset: String((page - 1) * ALERTS_PAGE_SIZE),
  });
  if (filter !== "all") params.set("status", filter);
  return `alerts?${params}`;
}

/** Link to /admin/alerts with this filter and page, leaving out defaults. */
export function alertsHref(filter: AlertFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "open") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/alerts?${query}` : "/admin/alerts";
}

const TYPE_LABEL: Record<string, string> = {
  invalid_code: "Unrecognised code",
  wrong_pupil: "Code for a different pupil",
  wrong_authorisation: "Code for a different person",
  used_code: "Code used again",
  expired_code: "Expired code",
  authorisation_inactive: "Deactivated pickup person",
  authorisation_pending: "Pickup person not approved",
  authorisation_scheduled: "Pickup person not started",
  authorisation_expired: "Pickup person's permission ended",
  repeated_failed_attempts: "Repeated failed attempts",
};

/** A short title for an alert type; unknown types are shown as written. */
export function alertTitle(type: string): string {
  return TYPE_LABEL[type] ?? type.replaceAll("_", " ");
}

/** Repeated failed attempts may mean someone is guessing codes, so they stand out. */
export function isUrgent(alert: SecurityAlert): boolean {
  return alert.alert_type === "repeated_failed_attempts";
}

/** How many open alerts the bell asks for; a full page shows as "99+". */
export const BELL_LIMIT = 100;

/** The bell badge for this many open alerts read: none for zero, "99+" when the page was full. */
export function bellBadge(count: number): string | null {
  if (count <= 0) return null;
  return count >= BELL_LIMIT ? "99+" : String(count);
}
