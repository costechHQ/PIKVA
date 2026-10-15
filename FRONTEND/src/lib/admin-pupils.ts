/**
 * Admin pupils list (SRS 18.4): search for /admin/pupils. Safe to import
 * from pages. FastAPI returns the whole school's pupils with no search, so
 * the page filters them here.
 */
import { type Pupil, pupilName } from "@/lib/parent";

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
