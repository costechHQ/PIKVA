/**
 * School users list (SRS 6.7): URL parameters and FastAPI query for
 * /admin/users. Safe to import from pages.
 */
import type { Role } from "@/lib/roles";

/** A user as GET /api/v1/schools/users returns it. */
export type SchoolUser = {
  id: number;
  school_id: number;
  name: string;
  email: string;
  phone: string;
  role: Role;
};

export const USERS_PAGE_SIZE = 50;

export const ROLE_FILTERS: readonly { label: string; role: Role | null }[] = [
  { label: "All", role: null },
  { label: "Parents", role: "parent" },
  { label: "Gate Staff", role: "gate_staff" },
  { label: "Admins", role: "school_admin" },
];

const ROLES = new Set<string>(["school_admin", "gate_staff", "parent"]);

/** Return the ?role= filter when it is a real role, else null (all users). */
export function parseRoleFilter(value: unknown): Role | null {
  return typeof value === "string" && ROLES.has(value) ? (value as Role) : null;
}

/** Return the ?page= number (1 or more); anything odd means page 1. */
export function parsePage(value: unknown): number {
  const page = typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : 1;
  return page >= 1 ? page : 1;
}

/**
 * FastAPI path for one page. Asks for one extra row: if it comes back there
 * is a next page (FastAPI sends no total count).
 */
export function usersApiPath(role: Role | null, page: number): string {
  const params = new URLSearchParams({
    limit: String(USERS_PAGE_SIZE + 1),
    offset: String((page - 1) * USERS_PAGE_SIZE),
  });
  if (role) params.set("role", role);
  return `schools/users?${params}`;
}

/** Link to /admin/users with this filter and page, leaving out defaults. */
export function usersPageHref(role: Role | null, page: number): string {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}
