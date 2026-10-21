import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactNode, useState } from "react";

import { Icon } from "@/components/Icon";
import type { CurrentUser } from "@/lib/auth-guard";
import { initials } from "@/lib/format";
import { isActive, navItems } from "@/lib/navigation";
import { HOME_PATH } from "@/lib/roles";
import { signOut } from "@/lib/sign-out";

type ParentShellProps = {
  user: CurrentUser;
  /** Page heading and browser tab title. */
  title: string;
  subtitle?: string;
  /** Browser tab title when it should differ from the heading. */
  tabTitle?: string;
  children: ReactNode;
};

/**
 * Signed-in layout for parents (SRS 18.9). Lighter and more personal than
 * the staff AppShell: a white sidebar with the parent's own card on large
 * screens; below lg, a compact top bar and a bottom tab bar so every page
 * is one thumb-tap away.
 */
export function ParentShell({ user, title, subtitle, tabTitle, children }: ParentShellProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const homePath = HOME_PATH[user.role];
  const items = navItems(user.role);

  function handleSignOut() {
    setSigningOut(true);
    void signOut();
  }

  return (
    <>
      <Head>
        <title>{`${tabTitle ?? title} · Pikva`}</title>
      </Head>
      <div className="min-h-screen lg:flex">
        {/* Large screens: sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-card px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen">
          <Link href={homePath} aria-label="Pikva home" className="px-2">
            <img src="/images/pikva-logo.png" alt="Pikva" width={750} height={341} className="h-9 w-auto" />
          </Link>

          <nav aria-label="Main" className="mt-10 flex-1 space-y-1">
            {items.map((item) => {
              const active = isActive(item, router.pathname, homePath);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                    active ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="rounded-3xl border border-brand-100 p-3">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block truncate text-xs text-ink-muted">{user.school_name}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-brand-100 px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
            >
              <Icon name="logout" className="h-4 w-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Small screens: compact top bar */}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-card/95 px-4 backdrop-blur lg:hidden">
            <Link href={homePath} aria-label="Pikva home">
              <img src="/images/pikva-logo.png" alt="Pikva" width={750} height={341} className="h-7 w-auto" />
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <Avatar name={user.name} small />
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                aria-label="Sign out"
                className="rounded-lg p-2 text-ink-muted hover:text-ink disabled:opacity-60"
              >
                <Icon name="logout" />
              </button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-8 sm:pt-8 lg:pb-10">
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-muted sm:text-base">{subtitle}</p>}
            <div className="mt-6 sm:mt-8">{children}</div>
          </main>
        </div>

        {/* Small screens: bottom tab bar */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <ul className="mx-auto flex max-w-lg">
            {items.map((item) => {
              const active = isActive(item, router.pathname, homePath);
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${
                      active ? "text-brand-600" : "text-ink-muted"
                    }`}
                  >
                    <Icon name={item.icon} />
                    {item.short ?? item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-sun-400 font-semibold text-white ${
        small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"
      }`}
    >
      {initials(name)}
    </span>
  );
}
