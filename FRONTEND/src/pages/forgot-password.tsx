import type { GetServerSideProps } from "next";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { AuthCard, FormError, authInputClass, linkClass, primaryButtonClass } from "@/components/AuthCard";
import { OFFLINE, detailText } from "@/lib/api-errors";
import { forgotErrorMessage } from "@/lib/reset-error";
import { LOGIN_PATH } from "@/lib/roles";

// Built per request, so the page carries this view's CSP nonce (src/proxy.ts).
export const getServerSideProps: GetServerSideProps = async () => ({ props: {} });

// Shown if FastAPI's 202 body is unreadable; same meaning as its own text.
const SENT_FALLBACK = "If an account exists for that email, we have sent a link to reset its password.";

/**
 * Ask for a password reset link (SRS 6.6). FastAPI answers the same way
 * whether or not the email is registered, so this page does too.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await response.json().catch(() => null);

      if (response.ok) {
        setSent(detailText(body) ?? SENT_FALLBACK);
      } else {
        setError(forgotErrorMessage(response.status, body, response.headers.get("Retry-After")));
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthCard pageTitle="Check your email" title="Check your email">
        <p className="text-center text-sm text-ink-muted">{sent}</p>
        <p className="mt-2 text-center text-sm text-ink-muted">The link works once and expires after 30 minutes.</p>
        <div className="mt-8 text-center">
          <Link href={LOGIN_PATH} className={linkClass}>
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      pageTitle="Forgot password"
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a reset link"
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`mt-1.5 ${authInputClass}`}
          />
        </div>

        <FormError message={error} />

        <button type="submit" disabled={submitting || !email.trim()} className={primaryButtonClass}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <div className="mt-6 text-center">
        <Link href={LOGIN_PATH} className={linkClass}>
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
