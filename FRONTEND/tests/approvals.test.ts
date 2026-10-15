import { describe, expect, test } from "bun:test";

import { approveBody, pendingApprovals } from "@/lib/approvals";
import type { AuthorisationStatus, PickupPerson, Pupil } from "@/lib/parent";

const ada: Pupil = {
  id: 4,
  school_id: 1,
  parent_id: 9,
  parent: { id: 9, name: "Ngozi Okafor", email: "ngozi@example.com", phone: "+2348000000001" },
  first_name: "Ada",
  last_name: "Okafor",
  photo_url: null,
  date_of_birth: "2016-05-01",
};

function person(id: number, status: AuthorisationStatus, updatedAt: string, pupilId = ada.id): PickupPerson {
  return {
    id,
    pupil_id: pupilId,
    picker_name: `Person ${id}`,
    picker_phone: "+2348000000000",
    relationship: "Uncle",
    photo_url: null,
    type: "regular",
    starts_at: "2026-10-01T07:00:00Z",
    expires_at: "2026-10-31T17:00:00Z",
    is_active: status !== "inactive",
    status,
    approved_at: status === "pending_approval" ? null : "2026-10-01T07:00:00Z",
    created_at: "2026-10-01T07:00:00Z",
    updated_at: updatedAt,
  };
}

describe("pendingApprovals", () => {
  test("lists only people awaiting approval, longest-waiting first, with their pupil", () => {
    const requests = pendingApprovals(
      [
        person(1, "active", "2026-10-02T08:00:00Z"),
        person(2, "pending_approval", "2026-10-15T09:00:00Z"),
        person(3, "inactive", "2026-10-01T08:00:00Z"),
        person(4, "pending_approval", "2026-10-14T09:00:00Z"),
      ],
      [ada],
    );

    expect(requests.map((request) => request.person.id)).toEqual([4, 2]);
    expect(requests[0].pupil).toBe(ada);
  });

  test("keeps a request whose pupil is missing, with no pupil", () => {
    const [request] = pendingApprovals([person(5, "pending_approval", "2026-10-15T09:00:00Z", 99)], [ada]);
    expect(request.pupil).toBeNull();
  });
});

test("approveBody sends the updated_at the admin saw", () => {
  const pending = person(6, "pending_approval", "2026-10-15T09:12:44.123456Z");
  expect(approveBody(pending)).toEqual({ updated_at: "2026-10-15T09:12:44.123456Z" });
});
