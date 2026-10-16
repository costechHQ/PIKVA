import { describe, expect, test } from "bun:test";

import {
  filterPersonRows,
  parseStatusFilter,
  peopleHref,
  personRows,
  statusCounts,
} from "@/lib/admin-pickup-people";
import type { AuthorisationStatus, PickupPerson, Pupil } from "@/lib/parent";

function pupil(id: number, first: string, last: string): Pupil {
  return {
    id,
    school_id: 1,
    parent_id: 9,
    parent: { id: 9, name: "Ngozi Okafor", email: "ngozi@example.com", phone: "+2348000000001" },
    first_name: first,
    last_name: last,
    photo_url: null,
    date_of_birth: "2016-05-01",
  };
}

function person(id: number, name: string, pupilId: number, status: AuthorisationStatus, phone = "0700000000"): PickupPerson {
  return {
    id,
    pupil_id: pupilId,
    picker_name: name,
    picker_phone: phone,
    relationship: "Uncle",
    photo_updated_at: null,
    type: "regular",
    starts_at: "2026-10-01T07:00:00Z",
    expires_at: "2026-10-31T17:00:00Z",
    is_active: status !== "inactive",
    status,
    approved_at: status === "pending_approval" ? null : "2026-10-01T07:00:00Z",
    created_at: "2026-10-01T07:00:00Z",
    updated_at: "2026-10-01T07:00:00Z",
  };
}

const pupils = [pupil(1, "Ada", "Okafor"), pupil(2, "Chídí", "Eze")];
const rows = personRows(
  [
    person(10, "Uncle Obi", 1, "active", "0711111111"),
    person(11, "aunt Bisi", 2, "pending_approval"),
    person(12, "Driver Sule", 1, "inactive"),
    person(13, "Aunt Bisi", 1, "active"),
    person(14, "Ghost", 99, "expired"),
  ],
  pupils,
);
const ids = (list: { person: PickupPerson }[]) => list.map((row) => row.person.id);

describe("personRows", () => {
  test("sorts by person then pupil name, ignoring case, and keeps a missing pupil as null", () => {
    expect(ids(rows)).toEqual([13, 11, 12, 14, 10]);
    expect(rows.find((row) => row.person.id === 14)?.pupil).toBeNull();
  });
});

describe("filterPersonRows", () => {
  test("filters by status", () => {
    expect(ids(filterPersonRows(rows, "active", ""))).toEqual([13, 10]);
    expect(ids(filterPersonRows(rows, null, ""))).toHaveLength(5);
  });

  test("searches person name, phone and pupil name, ignoring case and accents", () => {
    expect(ids(filterPersonRows(rows, null, "bisi"))).toEqual([13, 11]);
    expect(ids(filterPersonRows(rows, null, "0711"))).toEqual([10]);
    expect(ids(filterPersonRows(rows, null, "chidi"))).toEqual([11]);
    expect(ids(filterPersonRows(rows, "active", "bisi ada"))).toEqual([13]);
  });
});

test("statusCounts counts each status", () => {
  const counts = statusCounts(rows);
  expect(counts.get("active")).toBe(2);
  expect(counts.get("pending_approval")).toBe(1);
  expect(counts.has("scheduled")).toBe(false);
});

test("parseStatusFilter accepts only real statuses", () => {
  expect(parseStatusFilter("pending_approval")).toBe("pending_approval");
  expect(parseStatusFilter("deleted")).toBeNull();
  expect(parseStatusFilter(["active"])).toBeNull();
});

test("peopleHref leaves out defaults", () => {
  expect(peopleHref(null, "")).toBe("/admin/pickup-people");
  expect(peopleHref("active", "aunt bisi")).toBe("/admin/pickup-people?status=active&q=aunt+bisi");
});
