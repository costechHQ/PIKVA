import { useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The time the component mounted, but only in the browser: null during the
 * server render and hydration. Pages render "today" and clock times only
 * once this is set, so they use the viewer's time zone (the backend has no
 * school time zone) and never cause a server/browser hydration mismatch.
 */
export function useNow(): Date | null {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [mountedAt] = useState(() => new Date());

  return inBrowser ? mountedAt : null;
}
