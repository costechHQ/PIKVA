/** Tests for pickup person photo helpers and the browser's photo calls (SRS 9.3). */
import { afterEach, describe, expect, test } from "bun:test";

import { OFFLINE } from "@/lib/api-errors";
import { actionErrorMessage, sendPhoto } from "@/lib/parent-api";
import {
  PHOTO_MAX_BYTES,
  PHOTO_TOO_LARGE,
  PHOTO_WRONG_TYPE,
  personPhotoSrc,
  photoFileError,
  pupilPhotoPath,
  pupilPhotoSrc,
} from "@/lib/photos";

describe("personPhotoSrc", () => {
  test("is null without a photo", () => {
    expect(personPhotoSrc({ id: 7, photo_updated_at: null })).toBeNull();
  });

  test("points at the web app's route and changes with each new photo", () => {
    const first = personPhotoSrc({ id: 7, photo_updated_at: "2026-10-16T10:00:00+00:00" });
    const second = personPhotoSrc({ id: 7, photo_updated_at: "2026-10-16T11:00:00+00:00" });

    expect(first).toBe("/api/pickers/7/photo?v=2026-10-16T10%3A00%3A00%2B00%3A00");
    expect(second).not.toBe(first);
  });
});

describe("photoFileError", () => {
  test("accepts JPEG, PNG and WebP up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(photoFileError({ type, size: PHOTO_MAX_BYTES })).toBeNull();
    }
  });

  test("leaves a file without a type for FastAPI to judge", () => {
    expect(photoFileError({ type: "", size: 1000 })).toBeNull();
  });

  test("refuses other types, empty files and files over 5 MB", () => {
    expect(photoFileError({ type: "image/gif", size: 1000 })).toBe(PHOTO_WRONG_TYPE);
    expect(photoFileError({ type: "image/heic", size: 1000 })).toBe(PHOTO_WRONG_TYPE);
    expect(photoFileError({ type: "application/pdf", size: 1000 })).toBe(PHOTO_WRONG_TYPE);
    expect(photoFileError({ type: "image/jpeg", size: 0 })).toBe(PHOTO_WRONG_TYPE);
    expect(photoFileError({ type: "image/jpeg", size: PHOTO_MAX_BYTES + 1 })).toBe(PHOTO_TOO_LARGE);
  });
});

describe("actionErrorMessage for photos", () => {
  test("413 shows FastAPI's message, or a size message", () => {
    expect(actionErrorMessage(413, { detail: "The photo must be 5 MB or smaller" }, "Gone.")).toBe(
      "The photo must be 5 MB or smaller",
    );
    expect(actionErrorMessage(413, null, "Gone.")).toBe(PHOTO_TOO_LARGE);
  });
});

describe("sendPhoto", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function capture(response: Response) {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return response;
    }) as typeof fetch;
    return calls;
  }

  test("uploads the file as multipart form data in the photo field", async () => {
    const calls = capture(Response.json({ id: 7, status: "pending_approval" }));
    const file = new File([new Uint8Array([0xff, 0xd8])], "me.jpg", { type: "image/jpeg" });

    const result = await sendPhoto(7, file);

    expect(result).toEqual({ ok: true, data: { id: 7, status: "pending_approval" } as never });
    expect(calls[0].url).toBe("/api/pickers/7/photo");
    expect(calls[0].init?.method).toBe("PUT");
    const body = calls[0].init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("photo") as File).name).toBe("me.jpg");
  });

  test("removes with DELETE when no file is given", async () => {
    const calls = capture(Response.json({ id: 7, photo_updated_at: null }));

    await sendPhoto(7, null);

    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].init?.body).toBeUndefined();
  });

  test("turns refusals into messages", async () => {
    capture(Response.json({ detail: "The photo must be a JPEG, PNG or WebP image" }, { status: 422 }));
    expect(await sendPhoto(7, null)).toEqual({ ok: false, message: "The photo must be a JPEG, PNG or WebP image" });

    capture(Response.json({ detail: "Too many" }, { status: 429, headers: { "Retry-After": "120" } }));
    const limited = await sendPhoto(7, null);
    expect(limited.ok).toBe(false);
    expect(!limited.ok && limited.message).toContain("photo changes");
  });

  test("says when the browser is offline", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    expect(await sendPhoto(7, null)).toEqual({ ok: false, message: OFFLINE });
  });
});

describe("pupilPhotoSrc", () => {
  test("is null when the pupil has no uploaded photo", () => {
    expect(pupilPhotoSrc({ id: 3, photo_updated_at: null })).toBeNull();
  });

  test("names the pupil photo route and changes with a new upload", () => {
    const first = pupilPhotoSrc({ id: 3, photo_updated_at: "2026-10-16T10:00:00+00:00" });
    const second = pupilPhotoSrc({ id: 3, photo_updated_at: "2026-10-16T11:00:00+00:00" });

    expect(pupilPhotoPath(3)).toBe("/api/pupils/3/photo");
    expect(first?.startsWith("/api/pupils/3/photo?v=")).toBe(true);
    expect(first).not.toBe(second);
  });
});
