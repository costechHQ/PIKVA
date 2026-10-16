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

/** The web app's photo route for one pickup person (GET, PUT, DELETE). */
export function photoPath(personId: number): string {
  return `/api/pickers/${personId}/photo`;
}
