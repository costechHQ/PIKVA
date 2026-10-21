import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";

import { Icon } from "@/components/Icon";
import { PushPrompt } from "@/components/PushNotifications";
import type { CurrentUser } from "@/lib/auth-guard";
import {
  ALERT_POLL_MS,
  ALERT_REPEAT_MS,
  alertIds,
  hasUnheardAlert,
  newestAlertId,
  playAlertSound,
  readHeard,
  readMuted,
  setMuted,
  shouldRepeatSound,
  subscribeMuted,
  unlockAlertSound,
  writeHeard,
} from "@/lib/alert-sound";
import { BELL_LIMIT, bellBadge } from "@/lib/alerts";
import { ROLE_LABEL, isActive, navItems } from "@/lib/navigation";
import { HOME_PATH } from "@/lib/roles";
import { signOut } from "@/lib/sign-out";

type AppShellProps = {
  user: CurrentUser;
  /** Page heading and browser tab title. */
  title: string;
  subtitle?: string;
  /** Centre the heading and give the content a narrow, centred column (for form-style pages). */
  centered?: boolean;
  children: ReactNode;
};

/**
 * Signed-in layout for admins and gate staff (SRS 18.2): navy sidebar with
 * the role's menu and school card, a top bar with the user and Sign out.
 * Below the lg breakpoint the sidebar becomes a slide-in menu.
 */
export function AppShell({ user, title, subtitle, centered = false, children }: AppShellProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Close the phone menu after navigating.
  useEffect(() => {
    const close = () => setMenuOpen(false);
    router.events.on("routeChangeComplete", close);
    return () => router.events.off("routeChangeComplete", close);
  }, [router.events]);

  function handleSignOut() {
    setSigningOut(true);
    void signOut();
  }

  const homePath = HOME_PATH[user.role];

  return (
    <>
      <Head>
        <title>{`${title} · Pikva`}</title>
      </Head>
      <div className="min-h-screen lg:flex">
        {menuOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-30 bg-navy-950/50 lg:hidden"
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 px-4 py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-end px-2 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="rounded-md p-1 text-white/70 hover:text-white lg:hidden"
            >
              <Icon name="close" />
            </button>
          </div>

          <nav aria-label="Main" className="mt-6 flex-1 space-y-1 lg:mt-2">
            {navItems(user.role).map((item) => {
              const active = isActive(item, router.pathname, homePath);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-sun-400 text-navy-900" : "text-white/75 hover:bg-navy-800 hover:text-white"
                  }`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 rounded-xl bg-navy-800 px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-700 text-white">
              <Icon name="school" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-white">{user.school_name}</span>
              <span className="block text-xs text-white/60">{ROLE_LABEL[user.role]}</span>
            </span>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center gap-3 border-b border-line bg-card px-4 sm:px-6">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="rounded-md p-1.5 text-ink-muted hover:text-ink lg:hidden"
            >
              <Icon name="menu" />
            </button>
            <Link href="/" aria-label="Pikva home page" className="shrink-0">
              <img src="/images/pikva-logo.png" alt="Pikva" width={800} height={241} className="h-auto w-[79px] sm:w-[88px]" />
            </Link>
            <div className="ml-auto flex items-center gap-4">
              {/* SRS 18.2: the bell links to Security Alerts (admins only). */}
              {user.role === "school_admin" && <AlertBell userId={user.id} />}
              <Link href="/account" className="hidden rounded-lg px-2 py-1 text-right hover:bg-surface sm:block">
                <span className="block text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-ink-muted">{ROLE_LABEL[user.role]}</span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex items-center gap-2 rounded-full border border-brand-100 px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
              >
                <Icon name="logout" className="h-4 w-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </header>
          {/* Admins only: the alert notification prompt, until this browser has it on. */}
          {user.role === "school_admin" && <PushPrompt />}

          <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <div className={centered ? "mx-auto w-full max-w-4xl text-center" : undefined}>
              <h1 className="text-2xl font-extrabold text-navy-900">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            </div>
            <div className={centered ? "mx-auto mt-6 w-full max-w-4xl" : "mt-6"}>{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}

/**
 * The top bar bell with the number of open security alerts. The count is
 * read in the browser after the page has loaded, so it never slows a page
 * down; if it cannot be read the bell simply shows no number. While any
 * admin page is open it checks again every few seconds and sounds when a
 * new alert has arrived, including one that came in while the admin was
 * away. The tone then repeats every few seconds until every alert is
 * resolved. The speaker button beside it mutes that sound.
 */
function AlertBell({ userId }: { userId: number }) {
  const [badge, setBadge] = useState<string | null>(null);
  // Kept in the browser, so the server renders it as on until the page has loaded.
  const muted = useSyncExternalStore(
    subscribeMuted,
    () => readMuted(userId),
    () => false,
  );

  useEffect(() => {
    // Browsers allow sound only after the page has been used.
    window.addEventListener("pointerdown", unlockAlertSound, { once: true });
    window.addEventListener("keydown", unlockAlertSound, { once: true });

    let controller: AbortController | null = null;
    let openCount = 0;

    async function check() {
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch(`/api/proxy/alerts?status=open&limit=${BELL_LIMIT}`, { signal: controller.signal });
        const ids = response.ok ? alertIds(await response.json()) : null;
        if (!ids) return;

        openCount = ids.length;
        setBadge(bellBadge(ids.length));

        const newest = newestAlertId(ids);
        const heard = readHeard(userId);
        if (newest !== null && (heard === null || newest > heard)) {
          writeHeard(userId, newest);
          if (hasUnheardAlert(ids, heard) && !readMuted(userId)) playAlertSound();
        }
      } catch {
        // Offline or the page closed: the next check tries again.
      }
    }

    void check();
    const timer = window.setInterval(check, ALERT_POLL_MS);
    // Keeps sounding until every alert is resolved (the next check sets the count to 0).
    const repeatTimer = window.setInterval(() => {
      if (shouldRepeatSound(openCount, readMuted(userId))) playAlertSound();
    }, ALERT_REPEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.clearInterval(repeatTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", unlockAlertSound);
      window.removeEventListener("keydown", unlockAlertSound);
    };
  }, [userId]);

  function toggleMuted() {
    setMuted(userId, !muted);
    if (muted) {
      // So the admin hears what an alert sounds like.
      void unlockAlertSound().then(playAlertSound);
    }
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={toggleMuted}
        aria-pressed={!muted}
        aria-label={muted ? "Alert sound is off. Turn it on" : "Alert sound is on. Turn it off"}
        className="rounded-lg p-2 text-ink-muted hover:bg-surface hover:text-ink"
      >
        <Icon name={muted ? "mute" : "volume"} />
      </button>
      <AlertBellLink badge={badge} />
    </div>
  );
}

function AlertBellLink({ badge }: { badge: string | null }) {
  return (
    <Link
      href="/admin/alerts"
      aria-label={badge ? `Security alerts, ${badge} open` : "Security alerts"}
      className="relative rounded-lg p-2 text-ink-muted hover:bg-surface hover:text-ink"
    >
      <Icon name="alerts" />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-danger-600 px-1 text-center text-[11px] leading-5 font-semibold text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
