/**
 * Roles and where each one lands. Safe to import from pages (browser code):
 * nothing here reads server configuration.
 */

// Exactly the values FastAPI sends (UserRole in app/models/user.py).
export type Role = "school_admin" | "gate_staff" | "parent";

export const LOGIN_PATH = "/login";

// Where each role lands after signing in (SRS 18.2): each role has its own
// area and is redirected away from the others.
export const HOME_PATH: Record<Role, string> = {
  school_admin: "/admin",
  gate_staff: "/gate",
  parent: "/parent",
};
