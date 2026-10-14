import type { GetServerSideProps } from "next";

import { AppShell } from "@/components/AppShell";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";

type Props = { user: CurrentUser };

export const getServerSideProps: GetServerSideProps<Props> = (context) => requireUser(context, ["school_admin"]);

/**
 * Admin home (SRS 18.3). The dashboard panels arrive in W10, built from the
 * feature pages; until then this only welcomes the admin.
 */
export default function AdminHome({ user }: Props) {
  return (
    <AppShell user={user} title="Dashboard" subtitle={`Welcome back, ${user.name}. You are managing ${user.school_name}.`}>
      <section className="rounded-xl border border-line bg-card p-6">
        <p className="text-sm text-ink-muted">School management pages will appear in the menu as they are added.</p>
      </section>
    </AppShell>
  );
}
