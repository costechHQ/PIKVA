/**
 * Push notifications for security alerts (SRS 13): turning them on and off
 * for this browser, and the pure helpers behind that. Browser only, apart
 * from the pure helpers. The server's notification sender is FastAPI
 * /api/v1/push; public/sw.js shows each message.
 */
import { OFFLINE, UNAVAILABLE } from "@/lib/api-errors";

export type PushState =
  | "checking"
  /** This browser cannot show push notifications. */
  | "unsupported"
  /** The server has no push keys set up. */
  | "unavailable"
  /** The admin refused notifications in the browser's settings. */
  | "blocked"
  | "off"
  | "on";

export type PushResult = { ok: true } | { ok: false; message: string };

const WORKER_PATH = "/sw.js";

/** A VAPID public key (URL-safe base64) as the bytes the browser wants. */
export function urlBase64ToUint8Array(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The body FastAPI saves a subscription from, or null when the browser's one is incomplete. */
export function subscriptionBody(
  subscription: { endpoint?: string; keys?: { p256dh?: string; auth?: string } },
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** Whether this browser can do push notifications at all. */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** FastAPI's public key for subscribing, or null when it has none (or cannot be reached). */
async function fetchPublicKey(): Promise<string | null> {
  try {
    const response = await fetch("/api/proxy/push/config");
    if (!response.ok) return null;
    const json: unknown = await response.json();
    const key = (json as { public_key?: unknown } | null)?.public_key;
    return typeof key === "string" && key ? key : null;
  } catch {
    return null;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER_PATH);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Where this browser stands: on, off, blocked, or not possible. */
export async function readPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";

  try {
    if (Notification.permission === "granted" && (await currentSubscription())) return "on";
  } catch {
    // Treated as off: turning it on registers again.
  }

  return (await fetchPublicKey()) ? "off" : "unavailable";
}

async function post(path: string, body: unknown): Promise<PushResult> {
  let response: Response;

  try {
    response = await fetch(`/api/proxy/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: OFFLINE };
  }

  return response.ok ? { ok: true } : { ok: false, message: UNAVAILABLE };
}

/** Ask permission, subscribe this browser and tell FastAPI. */
export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, message: "This browser can't show notifications." };

  const key = await fetchPublicKey();
  if (!key) return { ok: false, message: "Notifications are not set up on the server yet." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notifications were not allowed. Allow them for this site in the browser's settings." };
  }

  try {
    const registration = await navigator.serviceWorker.register(WORKER_PATH);
    await navigator.serviceWorker.ready;

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));

    const body = subscriptionBody(subscription.toJSON());
    if (!body) return { ok: false, message: "This browser gave incomplete notification details. Try again." };

    return await post("push/subscriptions", body);
  } catch {
    return { ok: false, message: "Notifications could not be turned on in this browser." };
  }
}

/** Forget this browser on the server, then unsubscribe it. */
export async function disablePush(): Promise<PushResult> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return { ok: true };

    const result = await post("push/subscriptions/remove", { endpoint: subscription.endpoint });
    if (!result.ok) return result;

    await subscription.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, message: "Notifications could not be turned off in this browser." };
  }
}
