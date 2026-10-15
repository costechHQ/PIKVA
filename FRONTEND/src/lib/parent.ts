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

/** A time such as "10:24 AM" in the viewer's locale and time zone. Browser only (see useNow). */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** A date and time such as "15 Oct, 10:24 AM" in the viewer's locale and time zone. Browser only. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * A calendar date such as "1 May 2016" from "2016-05-01". Fixed locale and
 * UTC, so the server and browser render the same text and the day never shifts.
 */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Whether a photo URL is a plain web address. The backend accepts any text
 * for photo URLs, so only http(s) addresses are shown as images.
 */
export function isWebPhoto(url: string | null): url is string {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** How many recent pickups the pupil page shows. */
export const PUPIL_RECENT_RELEASES = 10;

/** Limits from the backend's PupilName and PhotoUrl fields. */
const NAME_MAX = 100;
const PHOTO_MAX = 500;

export type PupilForm = { first_name: string; last_name: string; date_of_birth: string; photo_url: string };

export type PupilChanges = Partial<Pick<Pupil, "first_name" | "last_name" | "date_of_birth" | "photo_url">>;

export function pupilForm(pupil: Pupil): PupilForm {
  return {
    first_name: pupil.first_name,
    last_name: pupil.last_name,
    date_of_birth: pupil.date_of_birth,
    photo_url: pupil.photo_url ?? "",
  };
}

/**
 * Check the edit form and return only the fields that changed (the PATCH
 * body), or an error message. today is "YYYY-MM-DD" in the viewer's time
 * zone. The backend validates again; this only gives faster, clearer messages.
 */
export function pupilChanges(
  pupil: Pupil,
  form: PupilForm,
  today: string,
): { changes: PupilChanges } | { error: string } {
  const first = form.first_name.trim();
  const last = form.last_name.trim();
  const photo = form.photo_url.trim();

  if (!first || !last) return { error: "Enter the pupil's first and last name." };
  if (first.length > NAME_MAX || last.length > NAME_MAX) return { error: `Names can be at most ${NAME_MAX} characters.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth)) return { error: "Enter the pupil's date of birth." };
  if (form.date_of_birth > today) return { error: "The date of birth cannot be in the future." };
  if (photo && (photo.length > PHOTO_MAX || !isWebPhoto(photo))) {
    return { error: "The photo link must be a web address starting with https://." };
  }

  const changes: PupilChanges = {};
  if (first !== pupil.first_name) changes.first_name = first;
  if (last !== pupil.last_name) changes.last_name = last;
  if (form.date_of_birth !== pupil.date_of_birth) changes.date_of_birth = form.date_of_birth;
  if ((photo || null) !== pupil.photo_url) changes.photo_url = photo || null;

  return { changes };
}

/** "YYYY-MM-DD" for a date in the viewer's time zone. */
export function localIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
