import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { AuthCard, FormError, authInputClass, linkClass, primaryButtonClass } from "@/components/AuthCard";
import { OFFLINE } from "@/lib/api-errors";
import {
  PASSWORD_MAX_LENGTH,
  RESET_LINK_INVALID,
  isResetTokenShape,
  newPasswordProblem,
  resetErrorMessage,
} from "@/lib/reset-error";
import { LOGIN_PATH } from "@/lib/roles";

type Props = { token: string | null };

/**
 * Read the token from the emailed link (<WEB_APP_URL>/reset-password?token=)
 * on the server, so the form never renders without it.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ query }) => ({
  props: { token: isResetTokenShape(query.token) ? query.token : null },
});

/** Set a new password with the emailed token (SRS 6.6). */
export default function ResetPasswordPage({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(token === null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const problem = newPasswordProblem(password, confirmation);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      if (response.ok) {
        setDone(true);
      } else if (response.status === 400 || response.status === 422) {
        setLinkDead(true);
      } else {
        const body = await response.json().catch(() => null);
        setError(resetErrorMessage(response.status, body, response.headers.get("Retry-After")));
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setSubmitting(false);
    }
  }

  // The token is in this page's URL: never send it to another site.
  const noReferrer = (
    <Head>
      <meta name="referrer" content="no-referrer" />
    </Head>
  );

  if (done) {
    return (
      <AuthCard pageTitle="Password changed" title="Password changed">
        {noReferrer}
        <p className="text-center text-sm text-ink-muted">
          Your password has been reset and you have been signed out everywhere. Sign in with your new password.
        </p>
        <Link href={LOGIN_PATH} className={`mt-8 block text-center ${primaryButtonClass}`}>
          Sign In
        </Link>
      </AuthCard>
    );
  }

  if (linkDead) {
    return (
      <AuthCard pageTitle="Reset link expired" title="Link not valid">
        {noReferrer}
        <p className="text-center text-sm text-ink-muted">
          {RESET_LINK_INVALID}. Reset links work once and expire after 30 minutes.
        </p>
        <Link href="/forgot-password" className={`mt-8 block text-center ${primaryButtonClass}`}>
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard pageTitle="Reset password" title="Choose a new password" subtitle="This signs you out on every device">
      {noReferrer}
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium">
            New password
          </label>
          <div className="relative mt-1.5">
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              maxLength={PASSWORD_MAX_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${authInputClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-muted hover:text-ink"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className={`mt-1.5 ${authInputClass}`}
          />
        </div>

        <FormError message={error} />

        <button type="submit" disabled={submitting || !password || !confirmation} className={primaryButtonClass}>
          {submitting ? "Saving…" : "Reset password"}
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
