import { describe, expect, test } from "bun:test";

import {
  type AuditRecord,
  actionLabel,
  auditApiPath,
  auditHref,
  auditLinks,
  auditNotes,
  parseActionFilter,
} from "@/lib/audit";

const record = (fields: Partial<AuditRecord>): AuditRecord => ({
  id: 1,
  user: { id: 2, name: "Admin Ama" },
  action: "pupil.updated",
  entity_type: "pupil",
  entity_id: 4,
  metadata: null,
  created_at: "2026-10-15T09:00:00Z",
  ...fields,
});

test("actions have plain labels and unknown ones stay readable", () => {
  expect(actionLabel("pickup_authorisation.approved")).toBe("Approved a pickup person");
  expect(actionLabel("pickup_authorisation.photo_updated")).toBe("Uploaded a pickup person's photo");
  expect(actionLabel("pickup_authorisation.photo_removed")).toBe("Removed a pickup person's photo");
  expect(actionLabel("user.setup_email_sent")).toBe("Sent a set-password link");
  expect(actionLabel("something.new")).toBe("something.new");
});

test("parseActionFilter accepts only known actions", () => {
  expect(parseActionFilter("pupil.released")).toBe("pupil.released");
  expect(parseActionFilter("drop table")).toBeNull();
  expect(parseActionFilter(undefined)).toBeNull();
});

test("paths and links leave out defaults", () => {
  expect(auditApiPath(null, 1)).toBe("audit-logs?limit=26&offset=0");
  expect(auditApiPath("alert.resolved", 2)).toBe("audit-logs?limit=26&offset=25&action=alert.resolved");
  expect(auditHref(null, 1)).toBe("/admin/audit-log");
  expect(auditHref("pupil.released", 3)).toBe("/admin/audit-log?action=pupil.released&page=3");
});

describe("auditNotes", () => {
  test("describes each kind of metadata in plain words", () => {
    expect(auditNotes({ pupil_id: 4, fields: ["picker_name", "picker_phone"], approval_reset: true })).toEqual([
      "Changed: name, phone",
      "Needs school approval again",
    ]);
    expect(auditNotes({ role: "gate_staff", via: "admin" })).toEqual(["Role: gate staff"]);
    expect(auditNotes({ sent: true })).toEqual(["Email sent"]);
    expect(auditNotes({ sent: false })).toEqual(["Email could not be sent"]);
    expect(auditNotes({ role: "school_admin", via: "registration" })).toEqual([
      "Role: administrator (registered the school)",
    ]);
    expect(auditNotes({ result: "used_code", method: "qr", stage: "release", alert_ids: [3] })).toEqual([
      "Code used again",
      "QR code",
      "At release",
    ]);
    expect(auditNotes({ verification_method: "manual" })).toEqual(["Code entered"]);
    expect(auditNotes({ alert_type: "repeated_failed_attempts" })).toEqual(["Repeated failed attempts"]);
    expect(auditNotes(null)).toEqual([]);
  });
});

test("auditLinks finds the pupil and pickup person a record mentions", () => {
  expect(auditLinks(record({}))).toEqual({ pupilId: 4, authorisationId: null });
  expect(
    auditLinks(record({ entity_type: "pickup_authorisation", entity_id: 9, metadata: { pupil_id: 4 } })),
  ).toEqual({ pupilId: 4, authorisationId: 9 });
  expect(
    auditLinks(record({ entity_type: "release_record", entity_id: 7, metadata: { pupil_id: 5, authorisation_id: 8 } })),
  ).toEqual({ pupilId: 5, authorisationId: 8 });
});
