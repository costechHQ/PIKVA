import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { type PushState, disablePush, enablePush, readPushState } from "@/lib/push";

/** Reads where this browser stands, and lets the admin turn push notifications on or off. */
function usePush() {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readPushState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  async function change(turnOn: boolean) {
    setBusy(true);
    setError(null);
    const result = turnOn ? await enablePush() : await disablePush();
    if (!result.ok) setError(result.message);
    setState(await readPushState());
    setBusy(false);
  }

  return { state, busy, error, turnOn: () => change(true), turnOff: () => change(false) };
}

const BUTTON =
  "rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 hover:bg-brand-700 disabled:opacity-60";

/**
 * A slim prompt on every admin page until this browser has notifications on,
 * so an alert reaches the admin even when Pikva is closed. Nothing shows once
 * they are on, or when they cannot be (the alerts page explains why).
 */
export function PushPrompt() {
  const { state, busy, error, turnOn } = usePush();

  if (state !== "off") return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-100 bg-sun-100 px-4 py-2.5 text-sm text-navy-900 sm:px-6">
      <Icon name="alerts" className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">Get a notification with sound for every security alert, even when Pikva is closed.</p>
      {error && (
        <p role="alert" className="w-full text-danger-600 sm:w-auto">
          {error}
        </p>
      )}
      <button type="button" onClick={turnOn} disabled={busy} className={BUTTON}>
        {busy ? "Turning on…" : "Turn on"}
      </button>
    </div>
  );
}

const EXPLANATION: Record<Exclude<PushState, "checking" | "off" | "on">, string> = {
  unsupported:
    "This browser can't show notifications. On an iPhone or iPad, tap Share, then Add to Home Screen, and open Pikva from the new icon. Otherwise use a recent Chrome, Edge, Firefox or Safari.",
  unavailable: "Notifications are not set up on the server yet. Ask whoever runs Pikva to add the push keys.",
  blocked: "Notifications are blocked for this site. Allow them in the browser's site settings, then reload this page.",
};

/** The notification setting for this browser, on the Security Alerts page. */
export function PushCard() {
  const { state, busy, error, turnOn, turnOff } = usePush();

  if (state === "checking") return null;

  return (
    <section aria-label="Alert notifications" className="rounded-3xl border border-brand-100 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon name="alerts" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Alert notifications on this device</h2>
          <p className="text-sm text-ink-muted">
            {state === "on"
              ? "On. A notification with sound arrives for every security alert, even when Pikva is closed."
              : state === "off"
                ? "Off. Turn them on to hear about every security alert, even when Pikva is closed."
                : EXPLANATION[state]}
          </p>
        </div>
        {state === "off" && (
          <button type="button" onClick={turnOn} disabled={busy} className={BUTTON}>
            {busy ? "Turning on…" : "Turn on"}
          </button>
        )}
        {state === "on" && (
          <button
            type="button"
            onClick={turnOff}
            disabled={busy}
            className="rounded-full border border-brand-100 px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
          >
            {busy ? "Turning off…" : "Turn off"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {error}
        </p>
      )}
    </section>
  );
}
