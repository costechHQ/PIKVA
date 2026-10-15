import { describe, expect, test } from "bun:test";

import {
  type PickupPerson,
  type Release,
  activePeopleByPupil,
  isSameLocalDay,
  latestReleaseTodayByPupil,
  pupilName,
  todaysReleases,
} from "@/lib/parent";

// Local times, so the tests pass in any time zone.
const NOW = new Date(2026, 9, 15, 16, 0);
const localIso = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString();

function release(id: number, pupilId: number, releasedAt: string): Release {
  return {
    id,
    pupil: { id: pupilId, first_name: "Ada", last_name: "Okafor", photo_url: null },
    authorisation: { id: 1, picker_name: "Emeka Okafor", relationship: "Uncle", photo_url: null },
    verified_by: { id: 9, name: "Gate Staff" },
    verification_method: "manual",
    result: "released",
    released_at: releasedAt,
  };
}

let nextId = 0;

function person(pupilId: number, status: PickupPerson["status"]): PickupPerson {
  return {
    id: ++nextId,
    pupil_id: pupilId,
    picker_name: "Emeka Okafor",
    picker_phone: "+2348000000000",
    relationship: "Uncle",
    photo_url: null,
    type: "regular",
    starts_at: localIso(1, 8),
    expires_at: localIso(30, 8),
    is_active: status !== "inactive",
    status,
    created_at: localIso(1, 8),
    updated_at: localIso(1, 8),
  };
}

describe("isSameLocalDay", () => {
  test("matches the start and end of today only", () => {
    expect(isSameLocalDay(new Date(2026, 9, 15, 0, 0).toISOString(), NOW)).toBe(true);
    expect(isSameLocalDay(new Date(2026, 9, 15, 23, 59).toISOString(), NOW)).toBe(true);
    expect(isSameLocalDay(new Date(2026, 9, 14, 23, 59).toISOString(), NOW)).toBe(false);
    expect(isSameLocalDay(new Date(2026, 9, 16, 0, 0).toISOString(), NOW)).toBe(false);
  });
});

describe("today's releases", () => {
  const releases = [release(3, 1, localIso(15, 15)), release(2, 1, localIso(15, 10)), release(1, 2, localIso(14, 15))];

  test("keeps only today's, in API order", () => {
    expect(todaysReleases(releases, NOW).map((r) => r.id)).toEqual([3, 2]);
  });

  test("keeps the newest release per pupil", () => {
    const latest = latestReleaseTodayByPupil(releases, NOW);
    expect(latest.get(1)?.id).toBe(3);
    expect(latest.has(2)).toBe(false);
  });
});

describe("activePeopleByPupil", () => {
  test("counts only active people", () => {
    const counts = activePeopleByPupil([
      person(1, "active"),
      person(1, "active"),
      person(1, "expired"),
      person(2, "scheduled"),
      person(2, "inactive"),
    ]);
    expect(counts.get(1)).toBe(2);
    expect(counts.has(2)).toBe(false);
  });
});

test("pupilName joins first and last names", () => {
  expect(pupilName({ first_name: "Ada", last_name: "Okafor" })).toBe("Ada Okafor");
});
