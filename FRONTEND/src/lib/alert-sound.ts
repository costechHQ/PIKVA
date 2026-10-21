/**
 * The sound for new security alerts (SRS 13): which alerts count as new, the
 * remembered settings and the sound itself. Browser only, apart from the
 * pure helpers. A page can only play a sound while it is open; a closed
 * browser needs a push notification instead.
 */

/** How often an open admin page asks for new alerts. */
export const ALERT_POLL_MS = 20_000;

/** How often the tone repeats while an alert is still open on an open admin page. */
export const ALERT_REPEAT_MS = 10_000;

/** Whether the tone should sound again: an alert is still open and the admin has not muted it. */
export function shouldRepeatSound(openCount: number, muted: boolean): boolean {
  return openCount > 0 && !muted;
}

/** The IDs of the alerts in an answer, or null when it is not a list of alerts. */
export function alertIds(alerts: unknown): number[] | null {
  if (!Array.isArray(alerts)) return null;

  const ids: number[] = [];
  for (const alert of alerts) {
    const id = (alert as { id?: unknown } | null)?.id;
    if (typeof id !== "number" || !Number.isInteger(id)) return null;
    ids.push(id);
  }
  return ids;
}

/** The newest (largest) alert ID, or null for none. */
export function newestAlertId(ids: readonly number[]): number | null {
  return ids.length === 0 ? null : Math.max(...ids);
}

/**
 * Whether an alert has arrived since the one this admin last heard. With no
 * earlier record (a first visit on this browser) nothing sounds; the newest
 * alert becomes the starting point instead.
 */
export function hasUnheardAlert(ids: readonly number[], heard: number | null): boolean {
  const newest = newestAlertId(ids);
  return heard !== null && newest !== null && newest > heard;
}

const HEARD_KEY = "pikva:alerts:heard:";
const MUTED_KEY = "pikva:alerts:muted:";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the sound then just starts again on the next visit.
  }
}

/** The newest alert ID this admin has been told about on this browser, or null. */
export function readHeard(userId: number): number | null {
  const value = read(HEARD_KEY + userId);
  return value !== null && /^\d{1,12}$/.test(value) ? Number(value) : null;
}

export function writeHeard(userId: number, alertId: number): void {
  write(HEARD_KEY + userId, String(alertId));
}

export function readMuted(userId: number): boolean {
  return read(MUTED_KEY + userId) === "1";
}

export function writeMuted(userId: number, muted: boolean): void {
  write(MUTED_KEY + userId, muted ? "1" : null);
}

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/**
 * Browsers keep sound off until the person has used the page. Call this on
 * the first click, tap or key press so a later alert can sound.
 */
export function unlockAlertSound(): Promise<void> {
  return audio()?.resume().catch(() => {}) ?? Promise.resolve();
}

/** Three rising two-tone beeps: easy to notice, short enough not to alarm a room. */
export function playAlertSound(): void {
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return;

  const start = ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    for (const [offset, frequency] of [[0, 880], [0.16, 1175]] as const) {
      const at = start + i * 0.45 + offset;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.16);
    }
  }
}

const mutedListeners = new Set<() => void>();

/** For useSyncExternalStore: tells the page when the mute setting changes, here or in another tab. */
export function subscribeMuted(listener: () => void): () => void {
  mutedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    mutedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Saves the mute setting and updates every page showing it. */
export function setMuted(userId: number, muted: boolean): void {
  writeMuted(userId, muted);
  mutedListeners.forEach((listener) => listener());
}
