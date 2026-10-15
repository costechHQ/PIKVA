import { describe, expect, test } from "bun:test";

import {
  type PickupPerson,
  type Pupil,
  type PupilForm,
  type Release,
  activePeopleByPupil,
  formatDate,
  groupReleasesByDay,
  historyApiPath,
  historyHref,
  parsePupilFilter,
  isWebPhoto,
  localIsoDate,
  pupilChanges,
  pupilForm,
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

describe("formatDate", () => {
  test("shows the calendar date without shifting the day", () => {
    expect(formatDate("2016-05-01")).toBe("1 May 2016");
    expect(formatDate("2016-12-31")).toBe("31 December 2016");
  });
});

describe("isWebPhoto", () => {
  test("accepts only http and https addresses", () => {
    expect(isWebPhoto("https://photos.example/ada.jpg")).toBe(true);
    expect(isWebPhoto("http://photos.example/ada.jpg")).toBe(true);
    expect(isWebPhoto("javascript:alert(1)")).toBe(false);
    expect(isWebPhoto("data:image/png;base64,AAAA")).toBe(false);
    expect(isWebPhoto("not a url")).toBe(false);
    expect(isWebPhoto(null)).toBe(false);
  });
});

describe("pupilChanges", () => {
  const pupil: Pupil = {
    id: 4,
    school_id: 1,
    parent_id: 2,
    first_name: "Ada",
    last_name: "Okafor",
    photo_url: null,
    date_of_birth: "2016-05-01",
  };
  const TODAY = "2026-10-15";
  const check = (form: Partial<PupilForm>) => pupilChanges(pupil, { ...pupilForm(pupil), ...form }, TODAY);

  test("an untouched form changes nothing", () => {
    expect(check({})).toEqual({ changes: {} });
  });

  test("sends only changed fields, trimmed", () => {
    expect(check({ first_name: "  Adaeze ", photo_url: " https://photos.example/a.jpg " })).toEqual({
      changes: { first_name: "Adaeze", photo_url: "https://photos.example/a.jpg" },
    });
  });

  test("clearing the photo sends null", () => {
    const withPhoto = { ...pupil, photo_url: "https://photos.example/a.jpg" };
    expect(pupilChanges(withPhoto, { ...pupilForm(withPhoto), photo_url: "  " }, TODAY)).toEqual({
      changes: { photo_url: null },
    });
  });

  test("rejects blank names, bad dates and non-web photo links", () => {
    expect(check({ last_name: "  " })).toHaveProperty("error");
    expect(check({ first_name: "A".repeat(101) })).toHaveProperty("error");
    expect(check({ date_of_birth: "" })).toHaveProperty("error");
    expect(check({ date_of_birth: "2026-10-16" })).toHaveProperty("error");
    expect(check({ photo_url: "javascript:alert(1)" })).toHaveProperty("error");
  });

  test("today is an allowed date of birth", () => {
    expect(check({ date_of_birth: TODAY })).toEqual({ changes: { date_of_birth: TODAY } });
  });
});

test("localIsoDate pads month and day", () => {
  expect(localIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
});

describe("pickup history paging", () => {
  const pupils = [{ id: 4 }, { id: 9 }] as Pupil[];

  test("accepts only the parent's own pupil ids", () => {
    expect(parsePupilFilter("4", pupils)).toBe(4);
    expect(parsePupilFilter("5", pupils)).toBeNull();
    expect(parsePupilFilter("4&limit=500", pupils)).toBeNull();
    expect(parsePupilFilter(["4", "9"], pupils)).toBeNull();
    expect(parsePupilFilter(undefined, pupils)).toBeNull();
  });

  test("asks FastAPI for one extra row at the right offset", () => {
    expect(historyApiPath(null, 1)).toBe("releases?limit=26&offset=0");
    expect(historyApiPath(4, 3)).toBe("releases?limit=26&offset=50&pupil_id=4");
  });

  test("links leave out defaults", () => {
    expect(historyHref(null, 1)).toBe("/parent/pickup-history");
    expect(historyHref(4, 2)).toBe("/parent/pickup-history?pupil=4&page=2");
  });
});

describe("groupReleasesByDay", () => {
  test("labels today and yesterday and keeps the API order", () => {
    const days = groupReleasesByDay(
      [
        release(5, 1, localIso(15, 15)),
        release(4, 2, localIso(15, 9)),
        release(3, 1, localIso(14, 15)),
        release(2, 1, localIso(10, 15)),
        release(1, 1, localIso(10, 9)),
      ],
      NOW,
    );

    expect(days.map((day) => [day.key, day.releases.map((r) => r.id)])).toEqual([
      ["2026-10-15", [5, 4]],
      ["2026-10-14", [3]],
      ["2026-10-10", [2, 1]],
    ]);
    expect(days[0].label).toBe("Today");
    expect(days[1].label).toBe("Yesterday");
  });

  test("an empty list has no days", () => {
    expect(groupReleasesByDay([], NOW)).toEqual([]);
  });
});
