import { describe, expect, test } from "bun:test";

import { SEARCH_MAX, filterParents, newPupilBody, parseSearch, searchPupils } from "@/lib/admin-pupils";
import type { Pupil } from "@/lib/parent";
import type { SchoolUser } from "@/lib/users";

function pupil(id: number, first: string, last: string, parentName: string): Pupil {
  return {
    id,
    school_id: 1,
    parent_id: 100 + id,
    parent: { id: 100 + id, name: parentName, email: `p${id}@example.com`, phone: "+2348000000001" },
    first_name: first,
    last_name: last,
    photo_url: null,
    date_of_birth: "2016-05-01",
  };
}

const pupils = [
  pupil(1, "Ada", "Okafor", "Ngozi Okafor"),
  pupil(2, "Chídí", "Eze", "Emeka Eze"),
  pupil(3, "Bayo", "Adeyemi", "Funmi Adeyemi"),
];

describe("parseSearch", () => {
  test("keeps trimmed text and ignores anything else", () => {
    expect(parseSearch("  ada  ")).toBe("ada");
    expect(parseSearch(["ada", "eze"])).toBe("");
    expect(parseSearch(undefined)).toBe("");
    expect(parseSearch("x".repeat(SEARCH_MAX + 20))).toHaveLength(SEARCH_MAX);
  });
});

describe("searchPupils", () => {
  const ids = (search: string) => searchPupils(pupils, search).map((p) => p.id);

  test("an empty search keeps every pupil", () => {
    expect(ids("")).toEqual([1, 2, 3]);
  });

  test("matches pupil or parent names, ignoring case and accents", () => {
    expect(ids("ADA")).toEqual([1]);
    expect(ids("eze")).toEqual([2]);
    expect(ids("chidi")).toEqual([2]);
    expect(ids("funmi")).toEqual([3]);
  });

  test("every word must match", () => {
    expect(ids("ada okafor")).toEqual([1]);
    expect(ids("ada eze")).toEqual([]);
  });
});

describe("newPupilBody", () => {
  const today = "2026-10-15";
  const form = {
    parent_id: "7",
    first_name: "  Ada ",
    last_name: "Okafor",
    date_of_birth: "2018-01-01",
    photo_url: " ",
  };

  test("builds the POST body with trimmed text and no empty photo", () => {
    expect(newPupilBody(form, today)).toEqual({
      body: { parent_id: 7, first_name: "Ada", last_name: "Okafor", date_of_birth: "2018-01-01", photo_url: null },
    });
  });

  test("needs a parent and uses the same checks as editing", () => {
    expect(newPupilBody({ ...form, parent_id: "" }, today)).toEqual({ error: "Choose the pupil's parent." });
    expect(newPupilBody({ ...form, last_name: " " }, today)).toEqual({ error: "Enter the pupil's first and last name." });
    expect(newPupilBody({ ...form, date_of_birth: "2026-10-16" }, today)).toEqual({
      error: "The date of birth cannot be in the future.",
    });
    expect(newPupilBody({ ...form, photo_url: "javascript:alert(1)" }, today)).toEqual({
      error: "The photo link must be a web address starting with https://.",
    });
  });
});

describe("filterParents", () => {
  const parents: SchoolUser[] = [
    { id: 1, school_id: 1, name: "Ngozi Okafor", email: "ngozi@example.com", phone: "0701111111", role: "parent", is_active: true },
    { id: 2, school_id: 1, name: "Émeka Eze", email: "emeka@example.com", phone: "0702222222", role: "parent", is_active: true },
  ];
  const ids = (filter: string) => filterParents(parents, filter).map((p) => p.id);

  test("matches name, email or phone, ignoring case and accents", () => {
    expect(ids("")).toEqual([1, 2]);
    expect(ids("emeka")).toEqual([2]);
    expect(ids("0701")).toEqual([1]);
    expect(ids("NGOZI example")).toEqual([1]);
    expect(ids("nobody")).toEqual([]);
  });
});
