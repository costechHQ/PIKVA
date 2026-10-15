import { describe, expect, test } from "bun:test";

import { actionErrorMessage } from "@/lib/parent-api";
import type { PickupPerson } from "@/lib/parent";
import {
  type PersonForm,
  emptyPersonForm,
  fromLocalInput,
  personBody,
  personForm,
  toLocalInput,
} from "@/lib/pickup-people";
import { UNAVAILABLE } from "@/lib/api-errors";

// Local times, so the tests pass in any time zone.
const NOW = new Date(2026, 9, 15, 9, 30);
const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

function filledForm(overrides: Partial<PersonForm> = {}): PersonForm {
  return {
    ...emptyPersonForm(4, NOW),
    picker_name: " Emeka Okafor ",
    picker_phone: " +2348000000000 ",
    relationship: "Uncle",
    expires_at: "2026-12-31T18:00",
    ...overrides,
  };
}

const existing: PickupPerson = {
  id: 12,
  pupil_id: 4,
  picker_name: "Emeka Okafor",
  picker_phone: "+2348000000000",
  relationship: "Uncle",
  photo_url: null,
  type: "Regular",
  // Seconds the form cannot show; they must not count as a change.
  starts_at: new Date(2026, 9, 1, 8, 0, 42).toISOString(),
  expires_at: local(31, 18).toISOString(),
  is_active: true,
  status: "active",
  created_at: local(1, 8).toISOString(),
  updated_at: local(1, 8).toISOString(),
};

describe("local datetime inputs", () => {
  test("round-trip a local time", () => {
    const value = toLocalInput(local(5, 7, 3));
    expect(value).toBe("2026-10-05T07:03");
    expect(fromLocalInput(value)).toBe(local(5, 7, 3).toISOString());
  });

  test("reject empty or malformed values", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("2026-10-05")).toBeNull();
    expect(fromLocalInput("2026-13-45T99:99")).toBeNull();
  });
});

describe("personBody for a new person", () => {
  test("builds the full POST body, trimmed, in UTC", () => {
    expect(personBody(filledForm(), NOW)).toEqual({
      body: {
        pupil_id: 4,
        picker_name: "Emeka Okafor",
        picker_phone: "+2348000000000",
        relationship: "Uncle",
        type: "Regular",
        starts_at: NOW.toISOString(),
        expires_at: new Date(2026, 11, 31, 18).toISOString(),
      },
    });
  });

  test("includes a photo only when given", () => {
    const result = personBody(filledForm({ photo_url: "https://photos.example/e.jpg" }), NOW);
    expect(result).toHaveProperty("body.photo_url", "https://photos.example/e.jpg");
  });

  test("rejects missing or invalid fields", () => {
    expect(personBody(filledForm({ pupil_id: "" }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ picker_name: "  " }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ picker_phone: "" }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ picker_phone: "1".repeat(31) }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ relationship: "" }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ type: " " }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ photo_url: "javascript:alert(1)" }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ expires_at: "" }), NOW)).toHaveProperty("error");
  });

  test("the end must be after the start and still to come", () => {
    expect(personBody(filledForm({ starts_at: "2026-10-20T08:00", expires_at: "2026-10-20T08:00" }), NOW)).toHaveProperty(
      "error",
      "The end time must be after the start time.",
    );
    expect(personBody(filledForm({ starts_at: "2026-10-01T08:00", expires_at: "2026-10-14T08:00" }), NOW)).toHaveProperty(
      "error",
      "The end time has already passed.",
    );
  });
});

describe("personBody for an existing person", () => {
  test("an untouched form changes nothing", () => {
    expect(personBody(personForm(existing), NOW, existing)).toEqual({ body: {} });
  });

  test("sends only changed fields", () => {
    const form = { ...personForm(existing), picker_phone: "+2348111111111", expires_at: "2026-11-30T18:00" };
    expect(personBody(form, NOW, existing)).toEqual({
      body: { picker_phone: "+2348111111111", expires_at: new Date(2026, 10, 30, 18).toISOString() },
    });
  });

  test("allows editing a person whose end time has passed", () => {
    const expired = { ...existing, expires_at: local(10, 18).toISOString(), status: "expired" as const };
    expect(personBody({ ...personForm(expired), relationship: "Aunt" }, NOW, expired)).toEqual({
      body: { relationship: "Aunt" },
    });
  });
});

describe("actionErrorMessage", () => {
  test("uses the 404 message, FastAPI sentences and a fallback", () => {
    expect(actionErrorMessage(404, { detail: "Pickup authorisation not found" }, "Gone.")).toBe("Gone.");
    expect(actionErrorMessage(422, { detail: "Expiry time must be after start time" }, "Gone.")).toBe(
      "Expiry time must be after start time",
    );
    expect(actionErrorMessage(422, { detail: [{ loc: ["body"], msg: "x" }] }, "Gone.")).toBe(
      "Check the details and try again.",
    );
    expect(actionErrorMessage(500, null, "Gone.")).toBe(UNAVAILABLE);
  });
});
