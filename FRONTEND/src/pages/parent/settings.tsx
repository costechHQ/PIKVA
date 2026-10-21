import type { GetServerSideProps } from "next";
import { useState } from "react";

import { FormError } from "@/components/AuthCard";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { OwnDetailsCard } from "@/components/OwnDetailsCard";
import { ParentShell } from "@/components/ParentShell";
import { SuccessNote } from "@/components/ParentUi";
import { OFFLINE } from "@/lib/api-errors";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";
import { forgotErrorMessage } from "@/lib/reset-error";

type Props = { user: CurrentUser };

export const getServerSideProps: GetServerSideProps<Props> = (context) => requireUser(context, ["parent"]);

/**
 * Parent settings (SRS 18.9): their details (name and phone editable, SRS 6.9),
 * changing the password while signed in (SRS 6.8),
 * and a reset email (SRS 6.6) for a forgotten current password.
 */
export default function ParentSettingsPage({ user }: Props) {
  return (
    <ParentShell user={user} title="Settings" subtitle="Your account and sign-in.">
      <div className="grid gap-6 lg:grid-cols-2">
        <OwnDetailsCard
          user={user}
          extraRows={[["School", user.school_name]]}
          emailNote="Your email is how you sign in. To change it, ask your school."
        />

        <PasswordSection email={user.email} />
      </div>
    </ParentShell>
  );
}

function PasswordSection({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setSent(true);
      } else {
        const body = await response.json().catch(() => null);
        setError(forgotErrorMessage(response.status, body, response.headers.get("Retry-After")));
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="password-heading" className="rounded-3xl border border-brand-100 bg-card p-5 shadow-sm sm:p-6">
      <h2 id="password-heading" className="font-semibold">
        Password
      </h2>
      <ChangePasswordForm />

      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-sm font-medium">Forgot your current password?</h3>
        <p className="mt-1 text-sm text-ink-muted">
          We&apos;ll email a link to <span className="font-medium text-ink">{email}</span> to choose a new one. It works
          for 30 minutes and signs you out on every device.
        </p>
        <div className="mt-3 space-y-3">
          <FormError message={error} />
          <SuccessNote message={sent ? "Check your email for the link." : null} />
          <button
            type="button"
            onClick={() => void sendLink()}
            disabled={sending}
            className="rounded-full border border-brand-100 px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
          >
            {sending ? "Sending…" : sent ? "Send another link" : "Email me a reset link"}
          </button>
        </div>
      </div>
    </section>
  );
}
