import type { GetServerSideProps } from "next";

import { AppShell } from "@/components/AppShell";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";
import { ROLE_LABEL } from "@/lib/navigation";

type Props = { user: CurrentUser };

export const getServerSideProps: GetServerSideProps<Props> = (context) =>
  requireUser(context, ["school_admin", "gate_staff"]);

/** Account for school staff: their details and changing their password (SRS 6.8). */
export default function AccountPage({ user }: Props) {
  return (
    <AppShell user={user} title="Account" subtitle="Your details and password.">
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <section aria-labelledby="details-heading" className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <h2 id="details-heading" className="font-semibold">
            Your details
          </h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            {(
              [
                ["Name", user.name],
                ["Email", user.email],
                ["Phone", user.phone ?? "Not set"],
                ["Role", ROLE_LABEL[user.role]],
                ["School", user.school_name],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="min-w-0 break-words font-medium sm:text-right">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            {user.role === "school_admin"
              ? "Administrator details cannot be changed here yet."
              : "To change your name, email or phone, ask a school administrator."}
          </p>
        </section>

        <section aria-labelledby="password-heading" className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <h2 id="password-heading" className="font-semibold">
            Password
          </h2>
          <ChangePasswordForm />
        </section>
      </div>
    </AppShell>
  );
}
