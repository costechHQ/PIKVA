/**
 * Pickup people form (SRS 9, 18.5, 18.9): turns the add/edit form into the
 * POST /pickers or PATCH /pickers/{id} body. Safe to import from pages.
 * The backend validates again; this only gives faster, clearer messages.
 */
import { type PickupPerson, isWebPhoto } from "@/lib/parent";

/** Suggestions only: the backend accepts any type label (SRS 9 does not list types). */
export const TYPE_SUGGESTIONS = ["Regular", "Temporary", "One-off"] as const;

// Limits from the backend's Name, Phone, Label and PhotoUrl fields.
const NAME_MAX = 150;
const PHONE_MAX = 30;
const LABEL_MAX = 50;
const PHOTO_MAX = 500;

/** Form values as typed. Times are datetime-local strings in the viewer's time zone. */
export type PersonForm = {
  pupil_id: string;
  picker_name: string;
  picker_phone: string;
  relationship: string;
  type: string;
  photo_url: string;
  starts_at: string;
  expires_at: string;
};

export type PersonBody = {
  pupil_id?: number;
  picker_name?: string;
  picker_phone?: string;
  relationship?: string;
  type?: string;
  photo_url?: string | null;
  starts_at?: string;
  expires_at?: string;
};

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, in the viewer's time zone. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A datetime-local value as a UTC ISO timestamp, or null when it is not a valid time. */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value); // No zone given, so read as the viewer's local time.
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** An empty add form: starts now, end time left for the parent to choose. */
export function emptyPersonForm(pupilId: number | null, now: Date): PersonForm {
  return {
    pupil_id: pupilId === null ? "" : String(pupilId),
    picker_name: "",
    picker_phone: "",
    relationship: "",
    type: "Regular",
    photo_url: "",
    starts_at: toLocalInput(now),
    expires_at: "",
  };
}

/** The edit form for an existing pickup person. */
export function personForm(person: PickupPerson): PersonForm {
  return {
    pupil_id: String(person.pupil_id),
    picker_name: person.picker_name,
    picker_phone: person.picker_phone,
    relationship: person.relationship,
    type: person.type,
    photo_url: person.photo_url ?? "",
    starts_at: toLocalInput(new Date(person.starts_at)),
    expires_at: toLocalInput(new Date(person.expires_at)),
  };
}

/**
 * Check the form and build the request body. Without original it is a new
 * person (full POST body); with original only the changed fields (PATCH body).
 */
export function personBody(
  form: PersonForm,
  now: Date,
  original?: PickupPerson,
): { body: PersonBody } | { error: string } {
  const name = form.picker_name.trim();
  const phone = form.picker_phone.trim();
  const relationship = form.relationship.trim();
  const type = form.type.trim();
  const photo = form.photo_url.trim();
  const startsAt = fromLocalInput(form.starts_at);
  const expiresAt = fromLocalInput(form.expires_at);

  if (!original && !/^\d+$/.test(form.pupil_id)) return { error: "Choose the pupil this person may collect." };
  if (!name) return { error: "Enter the pickup person's name." };
  if (name.length > NAME_MAX) return { error: `The name can be at most ${NAME_MAX} characters.` };
  if (!phone) return { error: "Enter the pickup person's phone number." };
  if (phone.length > PHONE_MAX) return { error: `The phone number can be at most ${PHONE_MAX} characters.` };
  if (!relationship) return { error: "Enter how this person is related to the pupil." };
  if (!type) return { error: "Enter the type of authorisation." };
  if (relationship.length > LABEL_MAX || type.length > LABEL_MAX) {
    return { error: `Relationship and type can be at most ${LABEL_MAX} characters.` };
  }
  if (photo && (photo.length > PHOTO_MAX || !isWebPhoto(photo))) {
    return { error: "The photo link must be a web address starting with https://." };
  }
  if (!startsAt) return { error: "Choose when this person may start collecting." };
  if (!expiresAt) return { error: "Choose when this authorisation ends." };
  if (expiresAt <= startsAt) return { error: "The end time must be after the start time." };
  if (!original && new Date(expiresAt) <= now) return { error: "The end time has already passed." };

  if (!original) {
    return {
      body: {
        pupil_id: Number(form.pupil_id),
        picker_name: name,
        picker_phone: phone,
        relationship,
        type,
        ...(photo ? { photo_url: photo } : {}),
        starts_at: startsAt,
        expires_at: expiresAt,
      },
    };
  }

  // Compare times at the form's minute precision, so untouched times are never resent.
  const before = personForm(original);
  const body: PersonBody = {};
  if (name !== original.picker_name) body.picker_name = name;
  if (phone !== original.picker_phone) body.picker_phone = phone;
  if (relationship !== original.relationship) body.relationship = relationship;
  if (type !== original.type) body.type = type;
  if ((photo || null) !== original.photo_url) body.photo_url = photo || null;
  if (startsAt !== fromLocalInput(before.starts_at)) body.starts_at = startsAt;
  if (expiresAt !== fromLocalInput(before.expires_at)) body.expires_at = expiresAt;

  return { body };
}
