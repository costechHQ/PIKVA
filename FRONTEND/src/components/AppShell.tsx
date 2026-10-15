import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactNode, useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import type { CurrentUser } from "@/lib/auth-guard";
import { BELL_LIMIT, bellBadge } from "@/lib/alerts";
import { ROLE_LABEL, isActive, navItems } from "@/lib/navigation";
import { HOME_PATH } from "@/lib/roles";
import { signOut } from "@/lib/sign-out";

type AppShellProps = {
  user: CurrentUser;
  /** Page heading and browser tab title. */
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/**
 * Signed-in layout for admins and gate staff (SRS 18.2): navy sidebar with
 * the role's menu and school card, a top bar with the user and Sign out.
 * Below the lg breakpoint the sidebar becomes a slide-in menu.
 */
export function AppShell({ user, title, subtitle, children }: AppShellProps) {
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
          <div className="flex items-center justify-between px-2">
            <Link href={homePath} aria-label="Pikva home">
              <Logo tone="light" size={32} />
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="rounded-md p-1 text-white/70 hover:text-white lg:hidden"
            >
              <Icon name="close" />
            </button>
          </div>

          <nav aria-label="Main" className="mt-10 flex-1 space-y-1">
            {navItems(user.role).map((item) => {
              const active = isActive(item, router.pathname, homePath);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    active ? "bg-brand-600 text-white" : "text-white/75 hover:bg-navy-800 hover:text-white"
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
            <div className="ml-auto flex items-center gap-4">
              {/* SRS 18.2: the bell links to Security Alerts (admins only). */}
              {user.role === "school_admin" && <AlertBell />}
              <Link href="/account" className="hidden rounded-lg px-2 py-1 text-right hover:bg-surface sm:block">
                <span className="block text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-ink-muted">{ROLE_LABEL[user.role]}</span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
              >
                <Icon name="logout" className="h-4 w-4" />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}

/**
 * The top bar bell with the number of open security alerts. The count is
 * read in the browser after the page has loaded, so it never slows a page
 * down; if it cannot be read the bell simply shows no number.
 */
function AlertBell() {
  const [badge, setBadge] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/proxy/alerts?status=open&limit=${BELL_LIMIT}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((alerts: unknown) => {
        if (Array.isArray(alerts)) setBadge(bellBadge(alerts.length));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

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
