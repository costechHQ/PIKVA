import type { GetServerSideProps } from "next";
import Link from "next/link";

import { ParentShell } from "@/components/ParentShell";
import { EmptyState, LoadError, PupilAvatar, Skeleton } from "@/components/ParentUi";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { firstName } from "@/lib/format";
import {
  OVERVIEW_RELEASES_LIMIT,
  type PickupPerson,
  type Pupil,
  type Release,
  activePeopleByPupil,
  formatTime,
  latestReleaseTodayByPupil,
  pupilName,
  todaysReleases,
} from "@/lib/parent";
import { useNow } from "@/lib/use-now";

type Data = { pupils: Pupil[]; people: PickupPerson[]; releases: Release[] };

type Props = { user: CurrentUser; data: Data | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["parent"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  // FastAPI returns only this parent's pupils, people and releases.
  try {
    const [pupils, people, releases] = await Promise.all([
      getAsUser<Pupil[]>(context, "pupils"),
      getAsUser<PickupPerson[]>(context, "pickers"),
      getAsUser<Release[]>(context, `releases?limit=${OVERVIEW_RELEASES_LIMIT}`),
    ]);
    return { props: { user, data: { pupils, people, releases } } };
  } catch {
    return { props: { user, data: null } };
  }
};

/** Parent portal overview (SRS 18.9): pupils, today's pickups, active pickup people. */
export default function ParentOverview({ user, data }: Props) {
  return (
    <ParentShell
      user={user}
      tabTitle="Overview"
      title={`Welcome back, ${firstName(user.name)}`}
      subtitle="Here's what's happening with your pupils today."
    >
      {data ? <Overview data={data} /> : <LoadError message="We couldn't load your overview." />}
    </ParentShell>
  );
}

function Overview({ data }: { data: Data }) {
  // "Today" and clock times use the viewer's time zone, so they wait for the browser.
  const now = useNow();
  const { pupils, people, releases } = data;

  if (pupils.length === 0) {
    return (
      <EmptyState title="No pupils linked to your account yet.">
        Your school links pupils to your account. Contact the school if a pupil is missing.
      </EmptyState>
    );
  }

  const activeCounts = activePeopleByPupil(people);
  const activeTotal = [...activeCounts.values()].reduce((sum, count) => sum + count, 0);
  const latestToday = now ? latestReleaseTodayByPupil(releases, now) : null;
  const today = now ? todaysReleases(releases, now) : null;

  return (
    <div className="space-y-8">
      <section aria-label="Summary" className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Pupils" value={pupils.length} highlight />
        <Stat label="Active pickup people" value={activeTotal} />
        <Stat label="Picked up today" value={latestToday ? latestToday.size : null} />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section aria-labelledby="pupils-heading" className="lg:col-span-2">
          <h2 id="pupils-heading" className="text-lg font-semibold">
            My pupils
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {pupils.map((pupil) => (
              <li key={pupil.id}>
                <PupilCard
                  pupil={pupil}
                  activePeople={activeCounts.get(pupil.id) ?? 0}
                  release={latestToday ? (latestToday.get(pupil.id) ?? null) : undefined}
                />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="today-heading">
          <div className="flex items-center justify-between">
            <h2 id="today-heading" className="text-lg font-semibold">
              Today&apos;s pickups
            </h2>
            <Link href="/parent/pickup-history" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View history
            </Link>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-card">
            {today === null ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            ) : today.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">No pickups yet today.</p>
            ) : (
              <ul className="divide-y divide-line">
                {today.map((release) => (
                  <li key={release.id} className="flex items-center gap-3 p-4">
                    <PupilAvatar pupil={release.pupil} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pupilName(release.pupil)}</p>
                      <p className="truncate text-xs text-ink-muted">
                        Picked up by {release.authorisation.picker_name} ({release.authorisation.relationship})
                      </p>
                    </div>
                    <time dateTime={release.released_at} className="shrink-0 text-xs font-medium text-ink-muted">
                      {formatTime(release.released_at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number | null; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 ${
        highlight
          ? "bg-gradient-to-br from-navy-900 via-navy-800 to-brand-600 text-white shadow-sm"
          : "border border-line bg-card"
      }`}
    >
      {value === null ? (
        <Skeleton className="h-8 w-10" />
      ) : (
        <p className="text-2xl font-semibold sm:text-3xl">{value}</p>
      )}
      <p className={`mt-1 text-xs sm:text-sm ${highlight ? "text-white/75" : "text-ink-muted"}`}>{label}</p>
    </div>
  );
}

/**
 * release: today's latest release, null when none yet, undefined while the
 * browser has not worked out "today".
 */
function PupilCard({ pupil, activePeople, release }: { pupil: Pupil; activePeople: number; release: Release | null | undefined }) {
  return (
    <article className="flex h-full flex-col items-start rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <PupilAvatar pupil={pupil} />
        <h3 className="min-w-0 truncate font-semibold">{pupilName(pupil)}</h3>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Today</p>
        {release === undefined ? (
          <Skeleton className="mt-2 h-6 w-36" />
        ) : release ? (
          <p className="mt-1 text-sm">
            <span className="inline-flex rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-600">
              Picked up · {formatTime(release.released_at)}
            </span>
            <span className="mt-1 block text-ink-muted">by {release.authorisation.picker_name}</span>
          </p>
        ) : (
          <p className="mt-1">
            <span className="inline-flex rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-muted">
              Not picked up yet
            </span>
          </p>
        )}
      </div>

      <p className={`mt-4 text-sm ${activePeople === 0 ? "text-warning-600" : "text-ink-muted"}`}>
        {activePeople === 0
          ? "No active pickup people"
          : `${activePeople} active pickup ${activePeople === 1 ? "person" : "people"}`}
      </p>

      <Link
        href={`/parent/pupils/${pupil.id}`}
        className="mt-4 inline-flex rounded-lg border border-line px-3 py-2 text-sm font-medium text-brand-600 hover:border-brand-500"
      >
        View pupil
      </Link>
    </article>
  );
}
