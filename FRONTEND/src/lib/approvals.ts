/**
 * School approval of parent-added pickup people (SRS 9.2) for
 * /admin/approvals. Safe to import from pages.
 */
import type { PickupPerson, Pupil } from "@/lib/parent";

/** A pickup person waiting for approval, with the pupil they would collect (null if not found). */
export type ApprovalRequest = { person: PickupPerson; pupil: Pupil | null };

/**
 * The people awaiting approval, longest-waiting first. updated_at is when
 * the parent last changed them, which is when they started waiting.
 */
export function pendingApprovals(people: readonly PickupPerson[], pupils: readonly Pupil[]): ApprovalRequest[] {
  const pupilsById = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  return people
    .filter((person) => person.status === "pending_approval")
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at) || a.id - b.id)
    .map((person) => ({ person, pupil: pupilsById.get(person.pupil_id) ?? null }));
}

/** The approve request body: the updated_at the admin saw, so later changes are not approved unseen. */
export function approveBody(person: PickupPerson): { updated_at: string } {
  return { updated_at: person.updated_at };
}
