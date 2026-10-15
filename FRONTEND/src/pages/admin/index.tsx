import type { GetServerSideProps } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { LoadError, PupilAvatar, Skeleton } from "@/components/ParentUi";
import { type SecurityAlert, alertTitle, isUrgent } from "@/lib/alerts";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { DASHBOARD_LIMIT, PANEL_SIZE, countText, mayHaveMore } from "@/lib/dashboard";
import { type PickupPerson, type Pupil, type Release, formatDateTime, formatTime, pupilName, todaysReleases } from "@/lib/parent";
import { useNow } from "@/lib/use-now";

type Data = {
  pupilCount: number;
  activePeople: number;
  waiting: PickupPerson[];
  pupilNames: Record<number, string>;
  releases: Release[];
  openAlerts: SecurityAlert[];
};

type Props = { user: CurrentUser; data: Data | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  // FastAPI limits every list to the admin's own school.
  try {
    const [pupils, people, releases, openAlerts] = await Promise.all([
      getAsUser<Pupil[]>(context, "pupils"),
      getAsUser<PickupPerson[]>(context, "pickers"),
      getAsUser<Release[]>(context, `releases?limit=${DASHBOARD_LIMIT}`),
      getAsUser<SecurityAlert[]>(context, `alerts?status=open&limit=${DASHBOARD_LIMIT}`),
    ]);
    return {
      props: {
        user,
        data: {
          pupilCount: pupils.length,
          activePeople: people.filter((person) => person.status === "active").length,
          waiting: people.filter((person) => person.status === "pending_approval"),
          pupilNames: Object.fromEntries(pupils.map((pupil) => [pupil.id, pupilName(pupil)])),
          releases,
          openAlerts,
        },
      },
    };
  } catch {
    return { props: { user, data: null } };
  }
};

/** Admin home (SRS 18.3): today at a glance, with links to act on anything waiting. */
export default function AdminHome({ user, data }: Props) {
  return (
    <AppShell user={user} title="Dashboard" subtitle={`Welcome back, ${user.name}. You are managing ${user.school_name}.`}>
      {data ? <Dashboard data={data} /> : <LoadError message="We couldn't load the dashboard." />}
    </AppShell>
  );
}

function Dashboard({ data }: { data: Data }) {
  // "Today" is the viewer's calendar day, so it waits for the browser.
  const now = useNow();
  const today = now ? todaysReleases(data.releases, now) : null;
  const pickedUp = today ? new Set(today.map((release) => release.pupil.id)).size : null;
  const urgent = data.openAlerts.some(isUrgent);

  return (
    <div className="space-y-8">
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Pupils" value={String(data.pupilCount)} href="/admin/pupils" highlight />
        <Stat label="Active pickup people" value={String(data.activePeople)} href="/admin/pickup-people?status=active" />
        <Stat
          label="Pupils picked up today"
          value={today && pickedUp !== null ? (mayHaveMore(today.length, data.releases.length) ? `${pickedUp}+` : String(pickedUp)) : null}
          href="/admin/pickup-history"
        />
        <Stat
          label="Open security alerts"
          value={countText(data.openAlerts.length)}
          href="/admin/alerts"
          tone={data.openAlerts.length === 0 ? undefined : urgent ? "danger" : "warning"}
        />
      </section>

      {data.waiting.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warning-50 px-4 py-3 text-sm">
          <span>
            {data.waiting.length} pickup {data.waiting.length === 1 ? "person is" : "people are"} waiting for approval.
            They cannot collect until approved.
          </span>
          <Link href="/admin/approvals" className="font-medium text-brand-600 hover:text-brand-700">
            Review approvals
          </Link>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Today's pickups" href="/admin/pickup-history" linkText="All pickups">
          {today === null ? (
            <PanelSkeleton />
          ) : today.length === 0 ? (
            <Empty>No pupils picked up yet today.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {today.slice(0, PANEL_SIZE).map((release) => (
                <li key={release.id} className="flex items-center gap-3 px-5 py-3">
                  <PupilAvatar pupil={release.pupil} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{pupilName(release.pupil)}</p>
                    <p className="truncate text-xs text-ink-muted">
                      by {release.authorisation.picker_name}
                      {release.verified_by && ` · released by ${release.verified_by.name}`}
                    </p>
                  </div>
                  <time dateTime={release.released_at} className="shrink-0 text-xs font-medium text-ink-muted">
                    {formatTime(release.released_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Open security alerts" href="/admin/alerts" linkText="All alerts">
          {data.openAlerts.length === 0 ? (
            <Empty>No open alerts. All clear.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.openAlerts.slice(0, PANEL_SIZE).map((alert) => (
                <li key={alert.id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${isUrgent(alert) ? "bg-danger-600" : "bg-warning-600"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{alertTitle(alert.alert_type)}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {alert.pupil_id !== null ? (data.pupilNames[alert.pupil_id] ?? `Pupil #${alert.pupil_id}`) : alert.message}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-ink-muted">
                    {now ? formatDateTime(alert.created_at) : <Skeleton className="h-3 w-16" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  highlight = false,
  tone,
}: {
  label: string;
  value: string | null;
  href: string;
  highlight?: boolean;
  tone?: "warning" | "danger";
}) {
  const style = highlight
    ? "bg-gradient-to-br from-navy-900 via-navy-800 to-brand-600 text-white shadow-sm"
    : tone === "danger"
      ? "border border-danger-600/30 bg-danger-50"
      : tone === "warning"
        ? "border border-warning-600/30 bg-warning-50"
        : "border border-line bg-card";
  return (
    <Link href={href} className={`block rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${style}`}>
      {value === null ? <Skeleton className="h-8 w-10" /> : <p className="text-2xl font-semibold sm:text-3xl">{value}</p>}
      <p className={`mt-1 text-xs sm:text-sm ${highlight ? "text-white/75" : "text-ink-muted"}`}>{label}</p>
    </Link>
  );
}

function Panel({ title, href, linkText, children }: { title: string; href: string; linkText: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-card shadow-sm">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="text-sm font-medium text-brand-600 hover:text-brand-700">
          {linkText}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 pb-5 text-sm text-ink-muted">{children}</p>;
}

function PanelSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3 px-5 pb-5">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}
