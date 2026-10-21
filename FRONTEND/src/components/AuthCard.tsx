import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";

/** Class names shared by the sign-in and password reset forms. */
export const inputClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/** The signed-out pages (sign in, forgot and reset password) use the purple landing-page look. */
export const authInputClass =
  "w-full rounded-xl border border-grape-100 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-grape-500 focus:ring-2 focus:ring-grape-100";

export const primaryButtonClass =
  "w-full rounded-full bg-grape-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-grape-600/30 transition hover:-translate-y-0.5 hover:bg-grape-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grape-600 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60";

export const linkClass = "text-sm font-medium text-grape-600 hover:text-grape-700";

type AuthCardProps = {
  /** Browser tab title, before " · Pikva". */
  pageTitle: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Centred white card with the Pikva logo, used by the signed-out pages. */
export function AuthCard({ pageTitle, title, subtitle, children }: AuthCardProps) {
  return (
    <>
      <Head>
        <title>{`${pageTitle} · Pikva`}</title>
      </Head>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-grape-50 to-white px-4 py-10">
        <div className="pointer-events-none absolute -left-20 top-16 h-56 w-56 rounded-full bg-sun-400/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-grape-400/25 blur-3xl" />

        <div className="motion-safe-anim relative w-full max-w-sm animate-rise rounded-3xl border border-grape-100 bg-white px-6 py-10 shadow-2xl shadow-grape-600/15 sm:px-8">
          <Link href="/" aria-label="Pikva home" className="flex justify-center">
            <img src="/images/pikva-logo.png" alt="Pikva" width={750} height={341} className="h-11 w-auto" />
          </Link>
          <h1 className="mt-8 text-center text-2xl font-extrabold text-grape-900">{title}</h1>
          {subtitle && <p className="mt-1 text-center text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </>
  );
}

/** Red message box for a failed form submission. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
      {message}
    </p>
  );
}
