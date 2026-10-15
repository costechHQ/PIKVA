/**
 * Admin pupils list (SRS 18.4): search for /admin/pupils. Safe to import
 * from pages. FastAPI returns the whole school's pupils with no search, so
 * the page filters them here.
 */
import { type Pupil, type PupilForm, pupilFormError, pupilName } from "@/lib/parent";
import type { SchoolUser } from "@/lib/users";

/** Longest search kept from ?q=; longer text is cut. */
export const SEARCH_MAX = 100;

/** The ?q= search, trimmed and shortened; "" when absent. */
export function parseSearch(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, SEARCH_MAX) : "";
}

/**
 * Pupils whose name or parent's name contains every word of the search,
 * ignoring case and accents. An empty search keeps every pupil.
 */
export function searchPupils(pupils: readonly Pupil[], search: string): Pupil[] {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...pupils];

  return pupils.filter((pupil) => {
    const text = fold(`${pupilName(pupil)} ${pupil.parent.name}`);
    return words.every((word) => text.includes(word));
  });
}

/** Lower case without accents, so "chidi" finds "Chídí". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Most parents the Add pupil form loads (FastAPI's largest page). */
export const PARENTS_LIMIT = 500;

/** FastAPI path for the parents to choose from, sorted by name. */
export const PARENTS_API_PATH = `schools/users?role=parent&limit=${PARENTS_LIMIT}`;

export type NewPupilForm = PupilForm & { parent_id: string };

export const EMPTY_NEW_PUPIL: NewPupilForm = {
  parent_id: "",
  first_name: "",
  last_name: "",
  date_of_birth: "",
  photo_url: "",
};

export type NewPupilBody = {
  parent_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  photo_url: string | null;
};

/**
 * Check the Add pupil form and return the POST body, or an error message.
 * today is "YYYY-MM-DD" in the viewer's time zone. The backend checks the
 * parent belongs to the school.
 */
export function newPupilBody(form: NewPupilForm, today: string): { body: NewPupilBody } | { error: string } {
  if (!/^\d{1,9}$/.test(form.parent_id)) return { error: "Choose the pupil's parent." };
  const error = pupilFormError(form, today);
  if (error) return { error };

  const photo = form.photo_url.trim();
  return {
    body: {
      parent_id: Number(form.parent_id),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      date_of_birth: form.date_of_birth,
      photo_url: photo || null,
    },
  };
}

/** Parents whose name, email or phone contains every word of the filter, ignoring case and accents. */
export function filterParents(parents: readonly SchoolUser[], filter: string): SchoolUser[] {
  const words = fold(filter).split(/\s+/).filter(Boolean);
  return parents.filter((parent) => {
    const text = fold(`${parent.name} ${parent.email} ${parent.phone}`);
    return words.every((word) => text.includes(word));
  });
}
