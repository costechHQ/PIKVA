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
  /** False once an admin has deactivated the account (SRS 6.7). */
  is_active: boolean;
};

/** POST /api/v1/schools/users answer: the user, and whether their set-password email went out (SRS 6.7). */
export type CreatedSchoolUser = SchoolUser & { setup_email_sent: boolean };

/** POST /api/v1/schools/users/{id}/setup-email answer. */
export type SetupEmailResult = { email_sent: boolean };

/** FastAPI path that emails a user a new set-password link. */
export function setupEmailPath(userId: number): string {
  return `schools/users/${userId}/setup-email`;
}

/**
 * What to tell the admin after a set-password email. "Sent" means the email
 * service accepted it, so the message never promises it reached the inbox.
 */
export function setupLinkMessage(user: { name: string; email: string }, sent: boolean): string {
  return sent
    ? `A set-password link was sent to ${user.email}. It works once, for 30 minutes.`
    : `The set-password link could not be emailed to ${user.name}. Check their email address and try again, or ask them to use "Forgot password?" on the sign-in page.`;
}

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

/** Longest search kept from ?q=; longer text is cut (FastAPI accepts up to 100). */
export const USER_SEARCH_MAX = 100;

/** The ?q= search, trimmed and shortened; "" when absent. */
export function parseUserSearch(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, USER_SEARCH_MAX) : "";
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
export function usersApiPath(role: Role | null, page: number, search = ""): string {
  const params = new URLSearchParams({
    limit: String(USERS_PAGE_SIZE + 1),
    offset: String((page - 1) * USERS_PAGE_SIZE),
  });
  if (role) params.set("role", role);
  if (search) params.set("q", search);
  return `schools/users?${params}`;
}

/** Link to /admin/users with this filter, search and page, leaving out defaults. */
export function usersPageHref(role: Role | null, page: number, search = ""): string {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

/** Roles an admin may create (SRS 6.7): never another administrator. */
export const CREATABLE_ROLES: readonly { role: Extract<Role, "parent" | "gate_staff">; label: string; hint: string }[] = [
  { role: "parent", label: "Parent", hint: "Manages their pupils and pickup people." },
  { role: "gate_staff", label: "Gate staff", hint: "Checks pickup codes and releases pupils." },
];

export type NewUserForm = { name: string; email: string; phone: string; role: string };

export type NewUserBody = { name: string; email: string; phone: string; role: "parent" | "gate_staff" };

/** The ?role= to preselect on Add user, when it is one an admin may create. */
export function parseCreatableRole(value: unknown): "parent" | "gate_staff" | "" {
  return value === "parent" || value === "gate_staff" ? value : "";
}

// Limits from the backend's Name and Phone fields.
const USER_NAME_MAX = 150;
const USER_PHONE_MAX = 30;

/**
 * Check the Add user form and return the POST body, or an error message.
 * The backend validates again (including the email) and rejects an email
 * already in use.
 */
export function newUserBody(form: NewUserForm): { body: NewUserBody } | { error: string } {
  if (form.role !== "parent" && form.role !== "gate_staff") return { error: "Choose whether this is a parent or gate staff." };
  const checked = checkContact(form);
  if ("error" in checked) return checked;
  return { body: { ...checked, role: form.role } };
}

/** Trimmed name, email and phone, or the first problem with them (shared by add and edit). */
function checkContact(form: { name: string; email: string; phone: string }): UserContact | { error: string } {
  const name = form.name.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();

  if (!name) return { error: "Enter the person's full name." };
  if (name.length > USER_NAME_MAX) return { error: `The name can be at most ${USER_NAME_MAX} characters.` };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address. The set-password link is sent there." };
  if (!phone) return { error: "Enter the person's phone number." };
  if (phone.length > USER_PHONE_MAX) return { error: `The phone number can be at most ${USER_PHONE_MAX} characters.` };

  return { name, email, phone };
}

export type UserContact = { name: string; email: string; phone: string };

/** Roles an admin may edit and deactivate (SRS 6.7): never an administrator. */
export function isManageable(user: Pick<SchoolUser, "role">): boolean {
  return user.role === "parent" || user.role === "gate_staff";
}

/**
 * Check the edit form and return only the fields that changed (the PATCH
 * body), or an error message. An empty body means nothing changed.
 */
export function userChanges(user: SchoolUser, form: UserContact): { body: Partial<UserContact> } | { error: string } {
  const checked = checkContact(form);
  if ("error" in checked) return checked;

  const body: Partial<UserContact> = {};
  for (const field of ["name", "email", "phone"] as const) {
    if (checked[field] !== user[field]) body[field] = checked[field];
  }
  return { body };
}
