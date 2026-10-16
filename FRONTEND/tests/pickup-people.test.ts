import { afterEach, describe, expect, test } from "bun:test";

import { actionErrorMessage, sendAsUser } from "@/lib/parent-api";
import type { PickupPerson } from "@/lib/parent";
import {
  type PersonForm,
  changeMessage,
  emptyPersonForm,
  formatCode,
  fromLocalInput,
  personBody,
  personForm,
  toLocalInput,
} from "@/lib/pickup-people";
import { OFFLINE, UNAVAILABLE } from "@/lib/api-errors";

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
  photo_updated_at: null,
  type: "Regular",
  // Seconds the form cannot show; they must not count as a change.
  starts_at: new Date(2026, 9, 1, 8, 0, 42).toISOString(),
  expires_at: local(31, 18).toISOString(),
  is_active: true,
  status: "active",
  approved_at: local(1, 8).toISOString(),
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

  test("never sends a photo: photos are uploaded on their own (SRS 9.3)", () => {
    const result = personBody(filledForm(), NOW);
    expect(result).not.toHaveProperty("body.photo_url");
  });

  test("rejects missing or invalid fields", () => {
    expect(personBody(filledForm({ pupil_id: "" }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ picker_name: "  " }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ picker_phone: "" }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ picker_phone: "1".repeat(31) }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ relationship: "" }), NOW)).toHaveProperty("error");
    expect(personBody(filledForm({ type: " " }), NOW)).toHaveProperty("error");
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

  test("shows FastAPI's reason for a conflict", () => {
    expect(actionErrorMessage(409, { detail: "Pickup authorisation is already approved" }, "Gone.")).toBe(
      "Pickup authorisation is already approved",
    );
    expect(actionErrorMessage(409, null, "Gone.")).toBe(
      "This was changed by someone else. Reload the page and try again.",
    );
  });
});

describe("changeMessage", () => {
  const pending = { ...existing, status: "pending_approval" as const, approved_at: null };

  test("says plainly what changed when no approval is needed", () => {
    expect(changeMessage(existing, "updated")).toBe("Emeka Okafor updated.");
    expect(changeMessage({ ...existing, status: "inactive" }, "deactivated")).toBe("Emeka Okafor deactivated.");
  });

  test("says the school must approve when the change left the person pending", () => {
    for (const change of ["added", "updated", "activated"] as const) {
      expect(changeMessage(pending, change)).toBe(
        `Emeka Okafor ${change}. Your school needs to approve them before they can collect.`,
      );
    }
  });
});

describe("formatCode", () => {
  test("groups the code in fours", () => {
    expect(formatCode("7F3B9K2D")).toBe("7F3B 9K2D");
    expect(formatCode("ABC")).toBe("ABC");
    expect(formatCode("")).toBe("");
  });
});

describe("sendAsUser", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function answer(response: Response) {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return response;
    }) as typeof fetch;
    return calls;
  }

  test("POSTs JSON through the proxy and returns the body", async () => {
    const calls = answer(Response.json({ code: "7F3B9K2D" }, { status: 201 }));

    const result = await sendAsUser("pickup/codes", "POST", { authorisation_id: 12 }, "Gone.");

    expect(result).toEqual({ ok: true, data: { code: "7F3B9K2D" } });
    expect(calls[0].url).toBe("/api/proxy/pickup/codes");
    expect(calls[0].init?.body).toBe('{"authorisation_id":12}');
  });

  test("a 429 names the wait from Retry-After", async () => {
    answer(new Response(null, { status: 429, headers: { "Retry-After": "600" } }));

    const result = await sendAsUser("pickup/codes", "POST", {}, "Gone.", "code requests");

    expect(result).toEqual({ ok: false, message: "Too many code requests. Try again in 10 minutes." });
  });

  test("a network failure gives the offline message", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;

    expect(await sendAsUser("pickers", "POST", {}, "Gone.")).toEqual({ ok: false, message: OFFLINE });
  });
});
