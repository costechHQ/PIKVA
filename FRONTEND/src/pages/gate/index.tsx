import type { GetServerSideProps } from "next";

import { AppShell } from "@/components/AppShell";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";

type Props = { user: CurrentUser };

export const getServerSideProps: GetServerSideProps<Props> = (context) => requireUser(context, ["gate_staff"]);

/** Gate staff home (SRS 18.6). Code verification is built in W6. */
export default function GateHome({ user }: Props) {
  return (
    <AppShell user={user} title="Gate Verification" subtitle={`Signed in at ${user.school_name}.`}>
      <section className="rounded-xl border border-line bg-card p-6">
        <p className="text-sm text-ink-muted">Pickup code verification will appear here.</p>
      </section>
    </AppShell>
  );
}
