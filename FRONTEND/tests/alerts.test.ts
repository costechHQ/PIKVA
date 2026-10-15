import { expect, test } from "bun:test";

import {
  type SecurityAlert,
  alertTitle,
  alertsApiPath,
  alertsHref,
  bellBadge,
  isUrgent,
  parseAlertFilter,
} from "@/lib/alerts";

test("parseAlertFilter defaults to open", () => {
  expect(parseAlertFilter(undefined)).toBe("open");
  expect(parseAlertFilter("resolved")).toBe("resolved");
  expect(parseAlertFilter("all")).toBe("all");
  expect(parseAlertFilter("deleted")).toBe("open");
});

test("alertsApiPath asks for one extra row and leaves out the status for all", () => {
  expect(alertsApiPath("open", 1)).toBe("alerts?limit=26&offset=0&status=open");
  expect(alertsApiPath("all", 3)).toBe("alerts?limit=26&offset=50");
});

test("alertsHref leaves out defaults", () => {
  expect(alertsHref("open", 1)).toBe("/admin/alerts");
  expect(alertsHref("resolved", 2)).toBe("/admin/alerts?status=resolved&page=2");
});

test("alertTitle names every gate failure and keeps unknown types readable", () => {
  for (const type of [
    "invalid_code",
    "wrong_pupil",
    "wrong_authorisation",
    "used_code",
    "expired_code",
    "authorisation_inactive",
    "authorisation_pending",
    "authorisation_scheduled",
    "authorisation_expired",
    "repeated_failed_attempts",
  ]) {
    expect(alertTitle(type)).not.toContain("_");
  }
  expect(alertTitle("new_kind")).toBe("new kind");
});

test("isUrgent marks repeated failed attempts", () => {
  const alert = { alert_type: "repeated_failed_attempts" } as SecurityAlert;
  expect(isUrgent(alert)).toBe(true);
  expect(isUrgent({ ...alert, alert_type: "used_code" })).toBe(false);
});

test("bellBadge hides zero and caps at 99+", () => {
  expect(bellBadge(0)).toBeNull();
  expect(bellBadge(7)).toBe("7");
  expect(bellBadge(99)).toBe("99");
  expect(bellBadge(100)).toBe("99+");
});
