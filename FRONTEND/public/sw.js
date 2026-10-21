/*
 * Pikva's service worker: shows a notification for each security alert pushed
 * by the server (SRS 13), even when no Pikva page is open. The device plays
 * its own notification sound. It caches nothing and handles no other requests.
 */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: show the standard text below.
  }

  const title = typeof data.title === "string" ? data.title : "Pikva security alert";
  const body = typeof data.body === "string" ? data.body : "Open Pikva to review the alert.";

  // A browser must show something for every push, so this always does.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      // The same tag with renotify makes each new alert sound again instead of silently replacing the last.
      tag: "pikva-security-alert",
      renotify: true,
      // Stays on screen until the admin acts on it.
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Always the alerts page, whatever the message says.
  const target = new URL("/admin/alerts", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((client) => client.url.startsWith(self.location.origin));

      if (open) {
        await open.focus();
        try {
          await open.navigate(target);
        } catch {
          // A page this worker does not control cannot be navigated; it is still focused.
        }
        return;
      }

      await self.clients.openWindow(target);
    }),
  );
});
