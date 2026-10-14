/**
 * Roles and where each one lands. Safe to import from pages (browser code):
 * nothing here reads server configuration.
 */

// Exactly the values FastAPI sends (UserRole in app/models/user.py).
export type Role = "school_admin" | "gate_staff" | "parent";

export const LOGIN_PATH = "/login";

// Where each role belongs. Parents get no web functionality, only a page
// pointing them to the mobile app.
export const HOME_PATH: Record<Role, string> = {
  school_admin: "/admin",
  gate_staff: "/gate",
  parent: "/use-mobile-app",
};
