import type { GetServerSideProps } from "next";

import { ParentShell } from "@/components/ParentShell";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";
import { firstName } from "@/lib/format";

type Props = { user: CurrentUser };

export const getServerSideProps: GetServerSideProps<Props> = (context) => requireUser(context, ["parent"]);

/**
 * Parent portal overview (SRS 18.9). Pupil cards and today's pickups are
 * added in P2; until then this only welcomes the parent.
 */
export default function ParentOverview({ user }: Props) {
  return (
    <ParentShell
      user={user}
      tabTitle="Overview"
      title={`Welcome back, ${firstName(user.name)}`}
      subtitle="Here's what's happening with your pupils today."
    >
      <section className="rounded-2xl border border-line bg-card p-6">
        <p className="text-sm text-ink-muted">Your pupils and today's pickups will appear here.</p>
      </section>
    </ParentShell>
  );
}
