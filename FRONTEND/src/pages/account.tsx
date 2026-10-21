import type { GetServerSideProps } from "next";

import { AppShell } from "@/components/AppShell";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { OwnDetailsCard } from "@/components/OwnDetailsCard";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";
import { ROLE_LABEL } from "@/lib/navigation";

type Props = { user: CurrentUser };

export const getServerSideProps: GetServerSideProps<Props> = (context) =>
  requireUser(context, ["school_admin", "gate_staff"]);

/** Account for school staff: their details (name and phone editable, SRS 6.9) and password (SRS 6.8). */
export default function AccountPage({ user }: Props) {
  return (
    <AppShell user={user} title="Account" subtitle="Your details and password." centered>
      <div className="mx-auto grid w-full max-w-xl gap-6 lg:max-w-none lg:grid-cols-2">
        <OwnDetailsCard
          user={user}
          extraRows={[
            ["Role", ROLE_LABEL[user.role]],
            ["School", user.school_name],
          ]}
          emailNote={
            user.role === "school_admin"
              ? "Your email is how you sign in and cannot be changed here yet."
              : "Your email is how you sign in. To change it, ask a school administrator."
          }
        />

        <section aria-labelledby="password-heading" className="rounded-3xl border border-brand-100 bg-card p-5 shadow-sm sm:p-6">
          <h2 id="password-heading" className="font-semibold">
            Password
          </h2>
          <ChangePasswordForm />
        </section>
      </div>
    </AppShell>
  );
}
