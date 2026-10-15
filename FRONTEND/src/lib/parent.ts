/**
 * Parent portal (SRS 18.9): the FastAPI shapes a parent reads and small
 * helpers for showing them. Safe to import from pages.
 *
 * The backend limits every one of these lists to the signed-in parent's own
 * pupils; nothing here filters for security.
 */

/** A pupil as GET /api/v1/pupils returns it. */
export type Pupil = {
  id: number;
  school_id: number;
  parent_id: number;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  date_of_birth: string;
};

export type AuthorisationStatus = "active" | "inactive" | "scheduled" | "expired";

/** A pickup person (authorisation) as GET /api/v1/pickers returns it. */
export type PickupPerson = {
  id: number;
  pupil_id: number;
  picker_name: string;
  picker_phone: string;
  relationship: string;
  photo_url: string | null;
  type: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  status: AuthorisationStatus;
  created_at: string;
  updated_at: string;
};

/** One release as GET /api/v1/releases returns it. */
export type Release = {
  id: number;
  pupil: { id: number; first_name: string; last_name: string; photo_url: string | null };
  authorisation: { id: number; picker_name: string; relationship: string; photo_url: string | null };
  verified_by: { id: number; name: string };
  verification_method: "qr" | "manual";
  result: "released";
  released_at: string;
};

/** How many recent releases the overview reads to find today's. */
export const OVERVIEW_RELEASES_LIMIT = 50;

export function pupilName(pupil: Pick<Pupil, "first_name" | "last_name">): string {
  return `${pupil.first_name} ${pupil.last_name}`;
}

/** Whether a timestamp falls on the same calendar day as now, in the viewer's time zone. */
export function isSameLocalDay(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** Today's releases, newest first (the API already sorts newest first). */
export function todaysReleases(releases: readonly Release[], now: Date): Release[] {
  return releases.filter((release) => isSameLocalDay(release.released_at, now));
}

/** The newest release today for each pupil, keyed by pupil id. */
export function latestReleaseTodayByPupil(releases: readonly Release[], now: Date): Map<number, Release> {
  const latest = new Map<number, Release>();
  for (const release of todaysReleases(releases, now)) {
    if (!latest.has(release.pupil.id)) latest.set(release.pupil.id, release);
  }
  return latest;
}

/** How many pickup people are currently active for each pupil, keyed by pupil id. */
export function activePeopleByPupil(people: readonly PickupPerson[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const person of people) {
    if (person.status === "active") counts.set(person.pupil_id, (counts.get(person.pupil_id) ?? 0) + 1);
  }
  return counts;
}

/** A time such as "10:24 AM" in the viewer's locale and time zone. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
