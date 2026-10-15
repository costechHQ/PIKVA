import { describe, expect, test } from "bun:test";

import { isActive, navItems } from "@/lib/navigation";
import { HOME_PATH } from "@/lib/roles";

describe("navItems", () => {
  test("every role starts on its own home page", () => {
    expect(navItems("school_admin")[0].href).toBe(HOME_PATH.school_admin);
    expect(navItems("gate_staff")[0].href).toBe(HOME_PATH.gate_staff);
    expect(navItems("parent")[0].href).toBe(HOME_PATH.parent);
  });

  test("gate staff see only gate pages and their own account", () => {
    expect(navItems("gate_staff").map((item) => item.href)).toEqual(["/gate", "/account"]);
  });

  test("admins have their account in the menu", () => {
    expect(navItems("school_admin").some((item) => item.href === "/account")).toBe(true);
  });

  test("admins never see gate-only pages", () => {
    expect(navItems("school_admin").some((item) => item.href.startsWith("/gate"))).toBe(false);
  });

  test("parents see only parent portal pages", () => {
    expect(navItems("parent").every((item) => item.href === "/parent" || item.href.startsWith("/parent/"))).toBe(true);
  });

  test("staff never see parent portal pages", () => {
    const staffItems = [...navItems("school_admin"), ...navItems("gate_staff")];
    expect(staffItems.some((item) => item.href.startsWith("/parent"))).toBe(false);
  });
});

describe("isActive", () => {
  const dashboard = { label: "Dashboard", href: "/admin", icon: "dashboard" } as const;
  const pupils = { label: "Pupils", href: "/admin/pupils", icon: "dashboard" } as const;

  test("the home item matches only the home page", () => {
    expect(isActive(dashboard, "/admin", "/admin")).toBe(true);
    expect(isActive(dashboard, "/admin/pupils", "/admin")).toBe(false);
  });

  test("other items match their sub-pages but not look-alike paths", () => {
    expect(isActive(pupils, "/admin/pupils", "/admin")).toBe(true);
    expect(isActive(pupils, "/admin/pupils/7", "/admin")).toBe(true);
    expect(isActive(pupils, "/admin/pupils-archive", "/admin")).toBe(false);
  });
});
