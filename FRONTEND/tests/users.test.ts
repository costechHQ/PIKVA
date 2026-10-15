import { describe, expect, test } from "bun:test";

import {
  USERS_PAGE_SIZE,
  newUserBody,
  parseCreatableRole,
  parsePage,
  parseRoleFilter,
  usersApiPath,
  usersPageHref,
} from "@/lib/users";

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

describe("newUserBody", () => {
  const form = { name: " Ngozi Okafor ", email: " ngozi@example.com ", phone: " 0700000003 ", role: "parent" };

  test("builds the POST body with trimmed text and no password", () => {
    expect(newUserBody(form)).toEqual({
      body: { name: "Ngozi Okafor", email: "ngozi@example.com", phone: "0700000003", role: "parent" },
    });
  });

  test("only parents and gate staff can be created", () => {
    expect(newUserBody({ ...form, role: "" })).toEqual({ error: "Choose whether this is a parent or gate staff." });
    expect(newUserBody({ ...form, role: "school_admin" })).toEqual({ error: "Choose whether this is a parent or gate staff." });
    expect("body" in newUserBody({ ...form, role: "gate_staff" })).toBe(true);
  });

  test("checks name, email and phone", () => {
    expect(newUserBody({ ...form, name: " " })).toEqual({ error: "Enter the person's full name." });
    expect(newUserBody({ ...form, name: "x".repeat(151) })).toEqual({ error: "The name can be at most 150 characters." });
    for (const email of ["", "ngozi", "ngozi@", "ngozi@example", "a b@example.com"]) {
      expect(newUserBody({ ...form, email })).toEqual({ error: "Enter a valid email address. The set-password link is sent there." });
    }
    expect(newUserBody({ ...form, phone: "" })).toEqual({ error: "Enter the person's phone number." });
    expect(newUserBody({ ...form, phone: "0".repeat(31) })).toEqual({ error: "The phone number can be at most 30 characters." });
  });
});

test("parseCreatableRole only preselects roles an admin may create", () => {
  expect(parseCreatableRole("parent")).toBe("parent");
  expect(parseCreatableRole("gate_staff")).toBe("gate_staff");
  expect(parseCreatableRole("school_admin")).toBe("");
  expect(parseCreatableRole(undefined)).toBe("");
});
