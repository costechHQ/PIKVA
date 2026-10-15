/**
 * Admin pickup people list (SRS 18.5): status filter and search for
 * /admin/pickup-people. Safe to import from pages. FastAPI returns every
 * pickup person in the school with no filter or search, so the page does both.
 */
import { fold } from "@/lib/admin-pupils";
import { type AuthorisationStatus, type PickupPerson, type Pupil, pupilName } from "@/lib/parent";

/** A pickup person with the pupil they collect (null if not found). */
export type PersonRow = { person: PickupPerson; pupil: Pupil | null };

export const STATUS_FILTERS: readonly { label: string; status: AuthorisationStatus | null }[] = [
  { label: "All", status: null },
  { label: "Active", status: "active" },
  { label: "Awaiting approval", status: "pending_approval" },
  { label: "Scheduled", status: "scheduled" },
  { label: "Expired", status: "expired" },
  { label: "Inactive", status: "inactive" },
];

const STATUSES = new Set<string>(STATUS_FILTERS.flatMap((filter) => (filter.status ? [filter.status] : [])));

/** The ?status= filter when it is a real status, else null (all). */
export function parseStatusFilter(value: unknown): AuthorisationStatus | null {
  return typeof value === "string" && STATUSES.has(value) ? (value as AuthorisationStatus) : null;
}

/** Join people to their pupils, sorted by pickup person's name, then pupil's name. */
export function personRows(people: readonly PickupPerson[], pupils: readonly Pupil[]): PersonRow[] {
  const pupilsById = new Map(pupils.map((pupil) => [pupil.id, pupil]));
  const name = (row: PersonRow) => `${row.person.picker_name} ${row.pupil ? pupilName(row.pupil) : ""}`;
  return people
    .map((person) => ({ person, pupil: pupilsById.get(person.pupil_id) ?? null }))
    .sort((a, b) => name(a).localeCompare(name(b), "en", { sensitivity: "base" }) || a.person.id - b.person.id);
}

/**
 * Rows with this status (null: all) whose pickup person's name or phone, or
 * pupil's name, contains every word of the search, ignoring case and accents.
 */
export function filterPersonRows(
  rows: readonly PersonRow[],
  status: AuthorisationStatus | null,
  search: string,
): PersonRow[] {
  const words = fold(search).split(/\s+/).filter(Boolean);
  return rows.filter(({ person, pupil }) => {
    if (status && person.status !== status) return false;
    const text = fold(`${person.picker_name} ${person.picker_phone} ${pupil ? pupilName(pupil) : ""}`);
    return words.every((word) => text.includes(word));
  });
}

/** How many people have each status. */
export function statusCounts(rows: readonly PersonRow[]): Map<AuthorisationStatus, number> {
  const counts = new Map<AuthorisationStatus, number>();
  for (const { person } of rows) counts.set(person.status, (counts.get(person.status) ?? 0) + 1);
  return counts;
}

/** Link to /admin/pickup-people with this filter and search, leaving out defaults. */
export function peopleHref(status: AuthorisationStatus | null, search: string): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("q", search);
  const query = params.toString();
  return query ? `/admin/pickup-people?${query}` : "/admin/pickup-people";
}
