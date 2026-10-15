import { describe, expect, test } from "bun:test";

import { SEARCH_MAX, parseSearch, searchPupils } from "@/lib/admin-pupils";
import type { Pupil } from "@/lib/parent";

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
