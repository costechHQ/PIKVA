import { describe, expect, test } from "bun:test";

import { dayLabel, dayRange, parseDay, parseTimeZone } from "@/lib/history-dates";

describe("parseDay", () => {
  test("accepts only real calendar dates", () => {
    expect(parseDay("2026-10-14")).toBe("2026-10-14");
    expect(parseDay("2028-02-29")).toBe("2028-02-29");
    for (const bad of ["2026-02-30", "2026-13-01", "14/10/2026", "", undefined, ["2026-10-14"]]) {
      expect(parseDay(bad)).toBeNull();
    }
  });
});

describe("parseTimeZone", () => {
  test("keeps known zones and falls back to UTC", () => {
    expect(parseTimeZone("Africa/Lagos")).toBe("Africa/Lagos");
    expect(parseTimeZone("Mars/Olympus")).toBe("UTC");
    expect(parseTimeZone(undefined)).toBe("UTC");
  });
});

describe("dayRange", () => {
  test("Lagos (UTC+1): the day starts at 23:00 UTC the evening before", () => {
    expect(dayRange({ day: "2026-10-14", timeZone: "Africa/Lagos" })).toEqual({
      since: "2026-10-13T23:00:00.000Z",
      until: "2026-10-14T23:00:00.000Z",
    });
  });

  test("UTC and month ends", () => {
    expect(dayRange({ day: "2026-10-31", timeZone: "UTC" })).toEqual({
      since: "2026-10-31T00:00:00.000Z",
      until: "2026-11-01T00:00:00.000Z",
    });
  });

  test("a day when the clocks go back is 25 hours long", () => {
    // New York leaves daylight time on 1 November 2026.
    const { since, until } = dayRange({ day: "2026-11-01", timeZone: "America/New_York" });
    expect(since).toBe("2026-11-01T04:00:00.000Z");
    expect(until).toBe("2026-11-02T05:00:00.000Z");
  });
});

test("dayLabel names the day", () => {
  expect(dayLabel("2026-10-14")).toBe("Wednesday, 14 October 2026");
});
