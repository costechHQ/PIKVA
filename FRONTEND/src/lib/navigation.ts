/**
 * App shell menu (SRS 18.2): each role sees only pages that exist and that
 * its endpoints allow. Add an entry when a feature's page is built, never
 * before, so the menu never links to a missing page.
 */
import type { Role } from "@/lib/roles";

export type IconName = "dashboard" | "gate" | "users" | "pupils" | "history" | "settings" | "approvals" | "pickup" | "alerts";

/** short: a shorter label for the phone bottom bar, when label is too long. */
export type NavItem = { label: string; href: string; icon: IconName; short?: string };

const MENUS: Record<Role, readonly NavItem[]> = {
  school_admin: [
    { label: "Dashboard", href: "/admin", icon: "dashboard" },
    { label: "Pupils", href: "/admin/pupils", icon: "pupils" },
    { label: "Pickup People", href: "/admin/pickup-people", icon: "pickup" },
    { label: "Pickup History", href: "/admin/pickup-history", icon: "history" },
    { label: "Security Alerts", href: "/admin/alerts", icon: "alerts" },
    { label: "Users", href: "/admin/users", icon: "users" },
    { label: "Approvals", href: "/admin/approvals", icon: "approvals" },
  ],
  gate_staff: [{ label: "Gate Verification", href: "/gate", icon: "gate" }],
  // Parent portal (SRS 18.9): its own layout, ParentShell.
  parent: [
    { label: "Overview", href: "/parent", icon: "dashboard" },
    { label: "My Pupils", href: "/parent/pupils", icon: "pupils", short: "Pupils" },
    { label: "Pickup People", href: "/parent/pickup-people", icon: "users", short: "People" },
    { label: "Pickup History", href: "/parent/pickup-history", icon: "history", short: "History" },
    { label: "Settings", href: "/parent/settings", icon: "settings" },
  ],
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
 * (/admin, /gate, /parent) only matches exactly; others also match their sub-pages,
 * so /admin/pupils/7 highlights "Pupils", not "Dashboard".
 */
export function isActive(item: NavItem, pathname: string, homePath: string): boolean {
  if (item.href === homePath) return pathname === homePath;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
