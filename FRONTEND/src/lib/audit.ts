/**
 * Audit log for admins (SRS 14): FastAPI shapes, filters and plain wording
 * for /admin/audit-log. Safe to import from pages. Audit records are only
 * read, never changed.
 */
import { alertTitle } from "@/lib/alerts";

/** A record as GET /api/v1/audit-logs returns it. Metadata never holds personal values. */
export type AuditRecord = {
  id: number;
  user: { id: number; name: string } | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const AUDIT_PAGE_SIZE = 25;

/** Every action the backend records (app/services/audit_service.py), with its wording. */
export const ACTION_LABELS: Record<string, string> = {
  "user.created": "Added a user",
  "user.password_reset_requested": "Asked to reset a password",
  "user.password_reset": "Reset a password",
  "pupil.created": "Added a pupil",
  "pupil.updated": "Changed a pupil",
  "pickup_authorisation.created": "Added a pickup person",
  "pickup_authorisation.updated": "Changed a pickup person",
  "pickup_authorisation.activated": "Activated a pickup person",
  "pickup_authorisation.deactivated": "Deactivated a pickup person",
  "pickup_authorisation.approved": "Approved a pickup person",
  "pickup_code.generated": "Got a pickup code",
  "pupil.released": "Released a pupil",
  "pickup.verification_failed": "Failed pickup check",
  "alert.resolved": "Resolved a security alert",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** The ?action= filter when it is a known action, else null (all). */
export function parseActionFilter(value: unknown): string | null {
  return typeof value === "string" && value in ACTION_LABELS ? value : null;
}

/** FastAPI path for one page, asking for one extra row to know if there is a next page. */
export function auditApiPath(action: string | null, page: number): string {
  const params = new URLSearchParams({
    limit: String(AUDIT_PAGE_SIZE + 1),
    offset: String((page - 1) * AUDIT_PAGE_SIZE),
  });
  if (action) params.set("action", action);
  return `audit-logs?${params}`;
}

/** Link to /admin/audit-log with this filter and page, leaving out defaults. */
export function auditHref(action: string | null, page: number): string {
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/audit-log?${query}` : "/admin/audit-log";
}

const FIELD_LABELS: Record<string, string> = {
  first_name: "first name",
  last_name: "last name",
  date_of_birth: "date of birth",
  photo_url: "photo",
  picker_name: "name",
  picker_phone: "phone",
  relationship: "relationship",
  type: "type",
  starts_at: "start time",
  expires_at: "end time",
};

const ROLE_LABELS: Record<string, string> = { parent: "parent", gate_staff: "gate staff", school_admin: "administrator" };

/**
 * Short notes from a record's metadata, such as "Changed: name, phone" or
 * "Needs school approval again". IDs are left to the page, which links them.
 */
export function auditNotes(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const notes: string[] = [];
  const text = (key: string) => (typeof metadata[key] === "string" ? (metadata[key] as string) : null);

  if (Array.isArray(metadata.fields) && metadata.fields.length > 0) {
    notes.push(`Changed: ${metadata.fields.map((field) => FIELD_LABELS[String(field)] ?? String(field)).join(", ")}`);
  }
  if (metadata.approval_reset === true) notes.push("Needs school approval again");
  const role = text("role");
  if (role) notes.push(`Role: ${ROLE_LABELS[role] ?? role}${text("via") === "registration" ? " (registered the school)" : ""}`);
  const result = text("result");
  if (result) notes.push(alertTitle(result));
  const method = text("method") ?? text("verification_method");
  if (method) notes.push(method === "qr" ? "QR code" : "Code entered");
  const stage = text("stage");
  if (stage) notes.push(stage === "release" ? "At release" : "At check");
  const alertType = text("alert_type");
  if (alertType) notes.push(alertTitle(alertType));
  const codeDate = text("code_date");
  if (codeDate) notes.push(`For ${codeDate}`);
  return notes;
}

/** The pupil and pickup person IDs a record mentions, for linking. */
export function auditLinks(record: AuditRecord): { pupilId: number | null; authorisationId: number | null } {
  const meta = record.metadata ?? {};
  const id = (value: unknown) => (typeof value === "number" ? value : null);
  return {
    pupilId: record.entity_type === "pupil" ? record.entity_id : id(meta.pupil_id),
    authorisationId: record.entity_type === "pickup_authorisation" ? record.entity_id : id(meta.authorisation_id),
  };
}
