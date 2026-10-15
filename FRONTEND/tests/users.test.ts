import { describe, expect, test } from "bun:test";

import { USERS_PAGE_SIZE, parsePage, parseRoleFilter, usersApiPath, usersPageHref } from "@/lib/users";

describe("parseRoleFilter", () => {
  test("accepts FastAPI's role values", () => {
    expect(parseRoleFilter("parent")).toBe("parent");
    expect(parseRoleFilter("gate_staff")).toBe("gate_staff");
    expect(parseRoleFilter("school_admin")).toBe("school_admin");
  });

  test("anything else means all users", () => {
    expect(parseRoleFilter(undefined)).toBeNull();
    expect(parseRoleFilter("PARENT")).toBeNull();
    expect(parseRoleFilter(["parent", "gate_staff"])).toBeNull();
    expect(parseRoleFilter("parent&limit=500")).toBeNull();
  });
});

describe("parsePage", () => {
  test("reads positive whole numbers", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("3")).toBe(3);
  });

  test("falls back to page 1", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("9999999")).toBe(1);
  });
});

describe("usersApiPath", () => {
  test("asks for one extra row to detect a next page", () => {
    expect(usersApiPath(null, 1)).toBe(`schools/users?limit=${USERS_PAGE_SIZE + 1}&offset=0`);
  });

  test("adds the role and the page offset", () => {
    expect(usersApiPath("gate_staff", 3)).toBe(
      `schools/users?limit=${USERS_PAGE_SIZE + 1}&offset=${2 * USERS_PAGE_SIZE}&role=gate_staff`,
    );
  });
});

describe("usersPageHref", () => {
  test("leaves out defaults", () => {
    expect(usersPageHref(null, 1)).toBe("/admin/users");
  });

  test("keeps the filter and page", () => {
    expect(usersPageHref("parent", 2)).toBe("/admin/users?role=parent&page=2");
  });
});
