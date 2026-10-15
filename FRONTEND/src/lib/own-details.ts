/**
 * Editing your own name and phone (SRS 6.9). Safe to import from pages.
 * The email is the sign-in identity and is never changed here.
 */

export type OwnDetailsForm = { name: string; phone: string };

// The backend's Name and Phone limits.
const NAME_MAX = 150;
const PHONE_MAX = 30;

/**
 * Check the form and return only the fields that changed (the PATCH body),
 * or an error message. An empty body means nothing changed.
 */
export function ownDetailsChanges(
  current: { name: string; phone: string | null },
  form: OwnDetailsForm,
): { body: Partial<OwnDetailsForm> } | { error: string } {
  const name = form.name.trim();
  const phone = form.phone.trim();

  if (!name) return { error: "Enter your full name." };
  if (name.length > NAME_MAX) return { error: `Your name can be at most ${NAME_MAX} characters.` };
  if (!phone) return { error: "Enter your phone number." };
  if (phone.length > PHONE_MAX) return { error: `The phone number can be at most ${PHONE_MAX} characters.` };

  const body: Partial<OwnDetailsForm> = {};
  if (name !== current.name) body.name = name;
  if (phone !== (current.phone ?? "")) body.phone = phone;
  return { body };
}
