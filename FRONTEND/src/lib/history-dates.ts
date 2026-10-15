/**
 * The day filter on pickup history (SRS 18.8). The page is built on the
 * server, which does not know the viewer's time zone, so the form sends the
 * browser's zone name with the date and the day's bounds are worked out
 * here. Safe to import from pages.
 */

export type DayFilter = { day: string; timeZone: string };

/** ?date= when it is a real calendar date "YYYY-MM-DD", else null. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null;
}

/** ?tz= when it is a time zone this runtime knows, else "UTC". */
export function parseTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.length > 64) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

/** Minutes the zone is ahead of UTC at this instant (Lagos: 60). */
function offsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return Math.round((asUtc - instant) / 60_000);
}

/** The UTC instant of local midnight starting this date in the zone. */
function localMidnight(y: number, m: number, d: number, timeZone: string): number {
  const guess = Date.UTC(y, m - 1, d);
  // Two passes settle days when the clocks change.
  let instant = guess - offsetMinutes(guess, timeZone) * 60_000;
  instant = guess - offsetMinutes(instant, timeZone) * 60_000;
  return instant;
}

/** since (inclusive) and until (exclusive) for the whole day in the zone, as ISO strings. */
export function dayRange({ day, timeZone }: DayFilter): { since: string; until: string } {
  const [y, m, d] = day.split("-").map(Number);
  return {
    since: new Date(localMidnight(y, m, d, timeZone)).toISOString(),
    until: new Date(localMidnight(y, m, d + 1, timeZone)).toISOString(),
  };
}

/** "Wednesday, 14 October 2026" for a date; the same on server and browser. */
export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
