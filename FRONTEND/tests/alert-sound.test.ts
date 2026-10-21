/** Tests for the new-alert sound rules (SRS 13). */
import { describe, expect, test } from "bun:test";

import { alertIds, hasUnheardAlert, newestAlertId, shouldRepeatSound } from "@/lib/alert-sound";

describe("shouldRepeatSound", () => {
  test("repeats while an alert is open and the sound is on", () => {
    expect(shouldRepeatSound(2, false)).toBe(true);
  });

  test("stops once every alert is resolved or the admin has muted it", () => {
    expect(shouldRepeatSound(0, false)).toBe(false);
    expect(shouldRepeatSound(3, true)).toBe(false);
  });
});

describe("alertIds", () => {
  test("reads the IDs of a list of alerts", () => {
    expect(alertIds([{ id: 4, message: "x" }, { id: 9 }])).toEqual([4, 9]);
    expect(alertIds([])).toEqual([]);
  });

  test("refuses anything that is not a list of alerts", () => {
    expect(alertIds(null)).toBeNull();
    expect(alertIds({ detail: "Not found" })).toBeNull();
    expect(alertIds([{ id: "4" }])).toBeNull();
    expect(alertIds([{ id: 1.5 }])).toBeNull();
    expect(alertIds([null])).toBeNull();
  });
});

describe("newestAlertId", () => {
  test("is the largest ID, or null for none", () => {
    expect(newestAlertId([3, 11, 7])).toBe(11);
    expect(newestAlertId([])).toBeNull();
  });
});

describe("hasUnheardAlert", () => {
  test("sounds for an alert newer than the last one heard", () => {
    expect(hasUnheardAlert([8, 12], 10)).toBe(true);
  });

  test("stays quiet when nothing is newer", () => {
    expect(hasUnheardAlert([8, 10], 10)).toBe(false);
    expect(hasUnheardAlert([], 10)).toBe(false);
  });

  test("stays quiet on a first visit, with nothing heard before", () => {
    expect(hasUnheardAlert([8, 12], null)).toBe(false);
  });
});
