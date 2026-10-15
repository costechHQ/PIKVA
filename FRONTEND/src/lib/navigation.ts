/**
 * App shell menu (SRS 18.2): each role sees only pages that exist and that
 * its endpoints allow. Add an entry when a feature's page is built, never
 * before, so the menu never links to a missing page.
 */
import type { Role } from "@/lib/roles";

export type IconName = "dashboard" | "gate" | "users";

export type NavItem = { label: string; href: string; icon: IconName };

const MENUS: Record<Role, readonly NavItem[]> = {
  school_admin: [
    { label: "Dashboard", href: "/admin", icon: "dashboard" },
    { label: "Users", href: "/admin/users", icon: "users" },
  ],
  gate_staff: [{ label: "Gate Verification", href: "/gate", icon: "gate" }],
  // Parents use the mobile app; the web shell is never shown to them.
  parent: [],
};

export const ROLE_LABEL: Record<Role, string> = {
  school_admin: "School Administrator",
  gate_staff: "Gate Staff",
  parent: "Parent",
};

/** Return the menu for a role. */
export function navItems(role: Role): readonly NavItem[] {
  return MENUS[role] ?? [];
}

/**
 * Return whether a menu item is the current page. A role's home item
 * (/admin, /gate) only matches exactly; others also match their sub-pages,
 * so /admin/pupils/7 highlights "Pupils", not "Dashboard".
 */
export function isActive(item: NavItem, pathname: string, homePath: string): boolean {
  if (item.href === homePath) return pathname === homePath;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
