import Head from "next/head";
import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";

/** Class names shared by the sign-in and password reset forms. */
export const inputClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export const primaryButtonClass =
  "w-full rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60";

export const linkClass = "text-sm font-medium text-brand-600 hover:text-brand-700";

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
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card px-6 py-10 shadow-sm sm:px-8">
          <div className="flex justify-center">
            <Logo size={40} />
          </div>
          <h1 className="mt-8 text-center text-2xl font-semibold">{title}</h1>
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
