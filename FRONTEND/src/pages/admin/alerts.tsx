import type { GetServerSideProps } from "next";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { LoadError, Skeleton } from "@/components/ParentUi";
import { PushCard } from "@/components/PushNotifications";
import {
  ALERTS_PAGE_SIZE,
  ALERT_FILTERS,
  type AlertFilter,
  type SecurityAlert,
  alertTitle,
  alertsApiPath,
  alertsHref,
  isUrgent,
  parseAlertFilter,
} from "@/lib/alerts";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type PickupPerson, type Pupil, formatDateTime, pupilName } from "@/lib/parent";
import { sendAsUser } from "@/lib/parent-api";
import { useNow } from "@/lib/use-now";
import { type SchoolUser, parsePage } from "@/lib/users";

/** Names for the IDs an alert refers to; an ID missing here is shown as a number. */
type Names = { pupils: Record<number, string>; people: Record<number, string>; staff: Record<number, string> };

type Data = { alerts: SecurityAlert[]; names: Names; filter: AlertFilter; page: number; hasNext: boolean };

type Props = { user: CurrentUser; data: Data | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;
  const filter = parseAlertFilter(context.query.status);
  const page = parsePage(context.query.page);

  // FastAPI limits every list to the admin's own school.
  try {
    const [rows, pupils, people, staff] = await Promise.all([
      getAsUser<SecurityAlert[]>(context, alertsApiPath(filter, page)),
      getAsUser<Pupil[]>(context, "pupils"),
      getAsUser<PickupPerson[]>(context, "pickers"),
      getAsUser<SchoolUser[]>(context, "schools/users?role=gate_staff&limit=500"),
    ]);
    const names: Names = {
      pupils: Object.fromEntries(pupils.map((pupil) => [pupil.id, pupilName(pupil)])),
      people: Object.fromEntries(people.map((person) => [person.id, person.picker_name])),
      staff: Object.fromEntries(staff.map((member) => [member.id, member.name])),
    };
    return {
      props: {
        user,
        data: { alerts: rows.slice(0, ALERTS_PAGE_SIZE), names, filter, page, hasNext: rows.length > ALERTS_PAGE_SIZE },
      },
    };
  } catch {
    return { props: { user, data: null } };
  }
};

/** Security alerts for admins (SRS 13, 18.7): failed gate checks to review and resolve. */
export default function AlertsPage({ user, data }: Props) {
  return (
    <AppShell user={user} title="Security Alerts" subtitle="Failed pickup checks at the gate, newest first.">
      {data ? <AlertList data={data} /> : <LoadError message="We couldn't load the security alerts." />}
    </AppShell>
  );
}

function AlertList({ data }: { data: Data }) {
  const { names, filter, page, hasNext } = data;
  const [alerts, setAlerts] = useState(data.alerts);

  function resolved(alert: SecurityAlert) {
    setAlerts((current) => current.map((a) => (a.id === alert.id ? alert : a)));
  }

  return (
    <div className="space-y-6">
      <PushCard />

      <nav aria-label="Filter alerts" className="flex flex-wrap gap-2">
        {ALERT_FILTERS.map((item) => {
          const active = item.filter === filter;
          return (
            <Link
              key={item.filter}
              href={alertsHref(item.filter, 1)}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                active ? "bg-brand-600 text-white" : "border border-line bg-card text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {alerts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-ink-muted">
          {page > 1 ? "No more alerts." : filter === "open" ? "No open alerts. All clear." : "No alerts here yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <AlertCard alert={alert} names={names} onResolved={resolved} />
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm sm:justify-end">
          {page > 1 ? (
            <Link href={alertsHref(filter, page - 1)} className="rounded-full border border-brand-100 bg-card px-4 py-2 font-medium hover:text-brand-700">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="px-2 text-ink-muted">Page {page}</span>
          {hasNext ? (
            <Link href={alertsHref(filter, page + 1)} className="rounded-full border border-brand-100 bg-card px-4 py-2 font-medium hover:text-brand-700">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  names,
  onResolved,
}: {
  alert: SecurityAlert;
  names: Names;
  onResolved: (alert: SecurityAlert) => void;
}) {
  // Times use the viewer's time zone, so they wait for the browser.
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = alert.status === "open";
  const urgent = isUrgent(alert);

  async function resolve() {
    setBusy(true);
    setError(null);
    const result = await sendAsUser<SecurityAlert>(`alerts/${alert.id}/resolve`, "POST", undefined, "This alert no longer exists.");
    setBusy(false);

    if (result.ok) onResolved(result.data);
    else setError(result.message);
  }

  return (
    <article
      className={`rounded-2xl border bg-card p-5 shadow-sm ${
        open ? (urgent ? "border-danger-600 border-l-4" : "border-line border-l-4 border-l-warning-600") : "border-line"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{alertTitle(alert.alert_type)}</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                open ? (urgent ? "bg-danger-50 text-danger-600" : "bg-warning-50 text-warning-600") : "bg-surface text-ink-muted"
              }`}
            >
              {open ? (urgent ? "Open · urgent" : "Open") : "Resolved"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{alert.message}</p>

          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Detail label="When">{now ? formatDateTime(alert.created_at) : <Skeleton className="mt-1 h-3 w-24" />}</Detail>
            {alert.attempted_by !== null && (
              <Detail label="Gate staff">{names.staff[alert.attempted_by] ?? `Staff #${alert.attempted_by}`}</Detail>
            )}
            {alert.pupil_id !== null && (
              <Detail label="Pupil">
                <Link href={`/admin/pupils/${alert.pupil_id}`} className="font-medium text-brand-600 hover:text-brand-700">
                  {names.pupils[alert.pupil_id] ?? `Pupil #${alert.pupil_id}`}
                </Link>
              </Detail>
            )}
            {alert.authorisation_id !== null && (
              <Detail label="Pickup person">
                {names.people[alert.authorisation_id] ?? `Pickup person #${alert.authorisation_id}`}
              </Detail>
            )}
            {alert.resolved_at && (
              <Detail label="Resolved">{now ? formatDateTime(alert.resolved_at) : <Skeleton className="mt-1 h-3 w-24" />}</Detail>
            )}
          </dl>
          {error && <p role="alert" className="mt-2 text-sm text-danger-600">{error}</p>}
        </div>

        {open && (
          <button
            type="button"
            onClick={() => void resolve()}
            disabled={busy}
            className="shrink-0 rounded-full border border-brand-100 px-4 py-2 text-sm font-medium text-ink-muted hover:border-brand-500 hover:text-brand-700 disabled:opacity-60"
          >
            {busy ? "Resolving…" : "Mark resolved"}
          </button>
        )}
      </div>
    </article>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
