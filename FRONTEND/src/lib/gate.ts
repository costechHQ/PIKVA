/**
 * Gate verification (SRS 11, 18.6): the FastAPI shapes gate staff see and
 * the words shown for each result. Safe to import from pages.
 */

/** Codes are 8 characters from this alphabet (backend PICKUP_CODE_ALPHABET: no 0, 1, I or O). */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

export type CheckResult =
  | "valid"
  | "invalid_code"
  | "wrong_pupil"
  | "wrong_authorisation"
  | "used_code"
  | "expired_code"
  | "authorisation_inactive"
  | "authorisation_pending"
  | "authorisation_scheduled"
  | "authorisation_expired";

export type GatePupil = { id: number; first_name: string; last_name: string; photo_url: string | null };

export type GatePicker = { id: number; picker_name: string; relationship: string; photo_updated_at: string | null };

/** POST /api/v1/pickup/verify. Pupil and pickup person only come with a valid code. */
export type VerifyResponse = {
  result: CheckResult;
  method: "qr" | "manual";
  verified: boolean;
  pupil: GatePupil | null;
  authorisation: GatePicker | null;
  code_expires_at: string | null;
};

/** POST /api/v1/pickup/refuse (SRS 11.4). result says why when nothing was refused. */
export type RefuseResponse = { result: CheckResult; method: "qr" | "manual"; refused: boolean };

/** POST /api/v1/pickup/release. */
export type ReleaseResponse = {
  result: CheckResult;
  method: "qr" | "manual";
  released: boolean;
  release_id: number | null;
  released_at: string | null;
  pupil: GatePupil | null;
  authorisation: GatePicker | null;
};

/**
 * Tidy a typed code (spaces and dashes removed, upper case) or say what is
 * wrong with it. Mistyped codes are caught here because every failed check
 * at the backend raises a security alert.
 */
export function normaliseCode(input: string): { code: string } | { error: string } {
  const code = input.replace(/[\s-]/g, "").toUpperCase();

  if (!code) return { error: "Enter the pickup code." };
  if ([...code].some((char) => !CODE_ALPHABET.includes(char))) {
    return { error: "Codes use letters and numbers only, never 0, 1, I or O. Check the code and try again." };
  }
  if (code.length !== CODE_LENGTH) return { error: `Codes are ${CODE_LENGTH} characters long. Check the code and try again.` };
  return { code };
}

/** What gate staff are told for each failed result. */
export const FAILURE_TEXT: Record<Exclude<CheckResult, "valid">, { title: string; detail: string }> = {
  invalid_code: { title: "Code not recognised", detail: "Check the code with the person. If it still fails, contact the school office." },
  wrong_pupil: { title: "Code is for a different pupil", detail: "This code does not belong to this pupil." },
  wrong_authorisation: { title: "Code is for a different person", detail: "This code was issued to someone else." },
  used_code: { title: "Code already used", detail: "This code has already released a pupil today." },
  expired_code: { title: "Code has expired", detail: "The parent can get a new code from Pikva." },
  authorisation_inactive: { title: "Pickup person is deactivated", detail: "They are not allowed to collect at the moment." },
  authorisation_pending: { title: "Not approved by the school yet", detail: "The school has not approved this pickup person." },
  authorisation_scheduled: { title: "Not allowed to collect yet", detail: "This person's permission has not started." },
  authorisation_expired: { title: "Permission has ended", detail: "This person's permission to collect has expired." },
};

/** The text for a failed result, with a fallback for any result the backend adds later. */
export function failureText(result: CheckResult): { title: string; detail: string } {
  return (
    FAILURE_TEXT[result as Exclude<CheckResult, "valid">] ?? {
      title: "Check failed",
      detail: "The code could not be accepted.",
    }
  );
}

/** Longest QR payload the backend accepts. */
const QR_MAX = 512;

export const NOT_A_PICKUP_QR = "This is not a Pikva pickup code. Ask for the QR code from the Pikva app, or type the code.";

/**
 * Check scanned QR text is a Pikva pickup code ({"code": ...} as the parent
 * app shows it) and return it unchanged for the backend, which reads only
 * the code. Anything else is rejected here, so scanning the wrong QR code
 * never raises a security alert.
 */
export function parseQrData(text: string): { qr_data: string } | { error: string } {
  if (text.length > QR_MAX) return { error: NOT_A_PICKUP_QR };
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { error: NOT_A_PICKUP_QR };
  }
  const code = typeof payload === "object" && payload !== null ? (payload as { code?: unknown }).code : undefined;
  if (typeof code !== "string" || "error" in normaliseCode(code)) return { error: NOT_A_PICKUP_QR };
  return { qr_data: text };
}

/** What to tell gate staff when the camera cannot start. */
export function cameraErrorText(error: unknown): string {
  // getUserMedia rejects with a DOMException, which is not an Error in every browser.
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow the camera for this site in the browser settings, or type the code.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. Type the code instead.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it, or type the code.";
  return "The camera could not start. Type the code instead.";
}
