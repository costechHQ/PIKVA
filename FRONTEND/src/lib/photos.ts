/**
 * Pickup person photos (SRS 9.3): limits shared by the browser and the
 * web server, and the web app's own photo address. Client-safe.
 */

/** FastAPI refuses photos over 5 MB; checked in the browser first to save the upload. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Room for the multipart boundary and headers around the photo, as FastAPI allows. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** The largest upload body the web server forwards. */
export const PHOTO_UPLOAD_MAX_BYTES = PHOTO_MAX_BYTES + MULTIPART_OVERHEAD_BYTES;

/** Types the file picker offers; FastAPI checks the real content. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

const ACCEPTED_TYPES = new Set(PHOTO_ACCEPT.split(","));

export const PHOTO_TOO_LARGE = "The photo must be 5 MB or smaller.";
export const PHOTO_WRONG_TYPE = "Choose a JPEG, PNG or WebP photo.";

/** The web app's photo route for one pickup person (GET, PUT, DELETE). */
export function photoPath(personId: number): string {
  return `/api/pickers/${personId}/photo`;
}

/** The web app's photo route for one pupil (GET, PUT, DELETE). */
export function pupilPhotoPath(pupilId: number): string {
  return `/api/pupils/${pupilId}/photo`;
}

/** The image address for a pupil's uploaded photo, or null when they have none. */
export function pupilPhotoSrc(pupil: { id: number; photo_updated_at: string | null }): string | null {
  if (!pupil.photo_updated_at) return null;
  return `${pupilPhotoPath(pupil.id)}?v=${encodeURIComponent(pupil.photo_updated_at)}`;
}

/**
 * The image address for a pickup person's photo, or null when they have
 * none. photo_updated_at is added so a new photo is fetched straight away.
 */
export function personPhotoSrc(person: { id: number; photo_updated_at: string | null }): string | null {
  if (!person.photo_updated_at) return null;
  return `${photoPath(person.id)}?v=${encodeURIComponent(person.photo_updated_at)}`;
}

/**
 * Why a chosen file cannot be uploaded, or null when it may be sent. Only a
 * quick check before uploading: FastAPI decides from the file's content.
 * An unknown type (some phones give none) is left for FastAPI to judge.
 */
export function photoFileError(file: { size: number; type: string }): string | null {
  if (file.type && !ACCEPTED_TYPES.has(file.type)) return PHOTO_WRONG_TYPE;
  if (file.size === 0) return PHOTO_WRONG_TYPE;
  if (file.size > PHOTO_MAX_BYTES) return PHOTO_TOO_LARGE;
  return null;
}
