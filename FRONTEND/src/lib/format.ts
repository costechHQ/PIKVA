/**
 * Small display helpers shared by pages. Safe to import from browser code.
 */

/** Up to two capital initials for an avatar: "Ada Okafor" → "AO", "  " → "?". */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase());

  if (letters.length === 0) return "?";
  if (letters.length === 1) return letters[0];
  return letters[0] + letters[letters.length - 1];
}

/** The first word of a name, for friendly greetings: "Ada Okafor" → "Ada". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
