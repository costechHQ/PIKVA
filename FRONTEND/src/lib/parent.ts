/**
 * Parent portal (SRS 18.9): the FastAPI shapes a parent reads and small
 * helpers for showing them. Safe to import from pages.
 *
 * The backend limits every one of these lists to the signed-in parent's own
 * pupils; nothing here filters for security.
 */

export type PupilParent = { id: number; name: string; email: string; phone: string };

/** A pupil as GET /api/v1/pupils returns it. */
export type Pupil = {
  id: number;
  school_id: number;
  parent_id: number;
  /** The pupil's parent, for school staff to contact the family (SRS 8). */
  parent: PupilParent;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  date_of_birth: string;
};

/** Worked out by the backend in this order: inactive, pending_approval, scheduled, expired, else active (SRS 9.1, 9.2). */
export type AuthorisationStatus = "active" | "inactive" | "pending_approval" | "scheduled" | "expired";

/** A pickup person (authorisation) as GET /api/v1/pickers returns it. */
export type PickupPerson = {
  id: number;
  pupil_id: number;
  picker_name: string;
  picker_phone: string;
  relationship: string;
  /** When the current photo was uploaded; null = no photo (SRS 9.3). The image is photoPath(id). */
  photo_updated_at: string | null;
  type: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  status: AuthorisationStatus;
  /** When the school approved the current details; null while waiting (SRS 9.2). */
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

/** One release as GET /api/v1/releases returns it. */
export type Release = {
  id: number;
  pupil: { id: number; first_name: string; last_name: string; photo_url: string | null };
  authorisation: { id: number; picker_name: string; relationship: string; photo_updated_at: string | null };
  /** The releasing staff member; null for parents, who are never told (SRS 18.9). */
  verified_by: { id: number; name: string } | null;
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

export type PeopleCounts = { active: number; pending: number };

export const NO_PEOPLE: PeopleCounts = { active: 0, pending: 0 };

/** How many pickup people are active, and how many await school approval, for each pupil. */
export function peopleCountsByPupil(people: readonly PickupPerson[]): Map<number, PeopleCounts> {
  const counts = new Map<number, PeopleCounts>();
  for (const person of people) {
    if (person.status !== "active" && person.status !== "pending_approval") continue;
    const count = counts.get(person.pupil_id) ?? { active: 0, pending: 0 };
    if (person.status === "active") count.active += 1;
    else count.pending += 1;
    counts.set(person.pupil_id, count);
  }
  return counts;
}

/** "2 active pickup people · 1 awaiting approval", or "No active pickup people". */
export function peopleCountsText({ active, pending }: PeopleCounts): string {
  const activeText =
    active === 0 ? "No active pickup people" : `${active} active pickup ${active === 1 ? "person" : "people"}`;
  return pending === 0 ? activeText : `${activeText} · ${pending} awaiting approval`;
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
 * The first problem with a pupil form, or null when it is fine. today is
 * "YYYY-MM-DD" in the viewer's time zone. Used when adding and editing.
 */
export function pupilFormError(form: PupilForm, today: string): string | null {
  const first = form.first_name.trim();
  const last = form.last_name.trim();
  const photo = form.photo_url.trim();

  if (!first || !last) return "Enter the pupil's first and last name.";
  if (first.length > NAME_MAX || last.length > NAME_MAX) return `Names can be at most ${NAME_MAX} characters.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth)) return "Enter the pupil's date of birth.";
  if (form.date_of_birth > today) return "The date of birth cannot be in the future.";
  if (photo && (photo.length > PHOTO_MAX || !isWebPhoto(photo))) {
    return "The photo link must be a web address starting with https://.";
  }
  return null;
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
  const error = pupilFormError(form, today);
  if (error) return { error };

  const first = form.first_name.trim();
  const last = form.last_name.trim();
  const photo = form.photo_url.trim();
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

/** Pickup history page size (FastAPI allows up to 200). */
export const HISTORY_PAGE_SIZE = 25;

/** The ?pupil= filter when it is one of the parent's pupils, else null (all pupils). */
export function parsePupilFilter(value: unknown, pupils: readonly Pupil[]): number | null {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return pupils.some((pupil) => pupil.id === id) ? id : null;
}

/**
 * FastAPI path for one history page. Asks for one extra row: if it comes
 * back there is a next page (FastAPI sends no total count).
 */
export function historyApiPath(
  pupilId: number | null,
  page: number,
  range: { since: string; until: string } | null = null,
): string {
  const params = new URLSearchParams({
    limit: String(HISTORY_PAGE_SIZE + 1),
    offset: String((page - 1) * HISTORY_PAGE_SIZE),
  });
  if (pupilId !== null) params.set("pupil_id", String(pupilId));
  if (range) {
    params.set("since", range.since);
    params.set("until", range.until);
  }
  return `releases?${params}`;
}

/**
 * Link to a pickup history page (the parent's by default, or base such as
 * /admin/pickup-history) with this filter and page, leaving out defaults.
 */
export function historyHref(
  pupilId: number | null,
  page: number,
  base = "/parent/pickup-history",
  day: { day: string; timeZone: string } | null = null,
): string {
  const params = new URLSearchParams();
  if (pupilId !== null) params.set("pupil", String(pupilId));
  if (day) {
    params.set("date", day.day);
    params.set("tz", day.timeZone);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export type ReleaseDay = { key: string; label: string; releases: Release[] };

/**
 * Group releases (newest first) by calendar day in the viewer's time zone:
 * "Today", "Yesterday", then dates such as "Monday 13 October". Browser only.
 */
export function groupReleasesByDay(releases: readonly Release[], now: Date): ReleaseDay[] {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const days: ReleaseDay[] = [];

  for (const release of releases) {
    const date = new Date(release.released_at);
    const key = localIsoDate(date);
    let day = days[days.length - 1];

    if (!day || day.key !== key) {
      const label =
        key === localIsoDate(now)
          ? "Today"
          : key === localIsoDate(yesterday)
            ? "Yesterday"
            : date.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
              });
      day = { key, label, releases: [] };
      days.push(day);
    }
    day.releases.push(release);
  }

  return days;
}
