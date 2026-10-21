import { photoRoute } from "@/lib/photo-route";

// The upload is forwarded as it arrives, so Next.js must not parse it
// (its parser handles JSON and text only, up to 1 MB).
export const config = { api: { bodyParser: false } };

/** /api/pickers/<id>/photo: a pickup person's photo (SRS 9.3). */
export default photoRoute("pickers");
