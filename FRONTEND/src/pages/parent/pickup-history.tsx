import type { GetServerSideProps } from "next";
import Link from "next/link";

import { DayField } from "@/components/DayField";
import { ParentShell } from "@/components/ParentShell";
import { EmptyState, LoadError, PupilAvatar, Skeleton } from "@/components/ParentUi";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type DayFilter, dayLabel, dayRange, parseDay, parseTimeZone } from "@/lib/history-dates";
import {
  HISTORY_PAGE_SIZE,
  type Pupil,
  type Release,
  formatTime,
  groupReleasesByDay,
  historyApiPath,
  historyHref,
  parsePupilFilter,
  pupilName,
} from "@/lib/parent";
import { useNow } from "@/lib/use-now";
import { parsePage } from "@/lib/users";

type Data = {
  pupils: Pupil[];
  releases: Release[];
  pupilId: number | null;
  day: DayFilter | null;
  page: number;
  hasNext: boolean;
};

type Props = { user: CurrentUser; data: Data | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["parent"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  // FastAPI returns only this parent's pupils and their releases.
  try {
    const pupils = await getAsUser<Pupil[]>(context, "pupils");
    const pupilId = parsePupilFilter(context.query.pupil, pupils);
    const date = parseDay(context.query.date);
    // The browser sends its time zone with the date (DayField), so "a day" is the parent's day.
    const day = date ? { day: date, timeZone: parseTimeZone(context.query.tz) } : null;
    const page = parsePage(context.query.page);
    const rows = await getAsUser<Release[]>(context, historyApiPath(pupilId, page, day ? dayRange(day) : null));

    return {
      props: {
        user,
        data: {
          pupils,
          releases: rows.slice(0, HISTORY_PAGE_SIZE),
          pupilId,
          day,
          page,
          hasNext: rows.length > HISTORY_PAGE_SIZE,
        },
      },
    };
  } catch {
    return { props: { user, data: null } };
  }
};

/** Pickup history (SRS 12, 18.9): every release of the parent's pupils, newest first. */
export default function PickupHistoryPage({ user, data }: Props) {
  return (
    <ParentShell user={user} title="Pickup History" subtitle="Every time one of your pupils was collected from school.">
      {data ? <History data={data} /> : <LoadError message="We couldn't load your pickup history." />}
    </ParentShell>
  );
}

function History({ data }: { data: Data }) {
  const { pupils, releases, pupilId, day, page, hasNext } = data;

  if (pupils.length === 0) {
    return (
      <EmptyState title="No pupils linked to your account yet.">
        Pickups appear here once your school links a pupil to your account.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {pupils.length > 1 && (
        <nav aria-label="Filter by pupil" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[null, ...pupils.map((pupil) => pupil.id)].map((id) => {
            const active = id === pupilId;
            const pupil = pupils.find((p) => p.id === id);
            return (
              <Link
                key={id ?? "all"}
                href={historyHref(id, 1, undefined, day)}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                  active ? "bg-brand-600 text-white" : "border border-line bg-card text-ink-muted hover:text-ink"
                }`}
              >
                {pupil ? pupil.first_name : "All pupils"}
              </Link>
            );
          })}
        </nav>
      )}

      {/* A plain GET form, so the filter works before scripts load; it keeps the chosen pupil. */}
      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {pupilId !== null && <input type="hidden" name="pupil" value={pupilId} />}
        <DayField day={day?.day ?? ""} className="sm:w-48" />
        <div className="flex gap-2">
          <button type="submit" className="rounded-full bg-brand-600 shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            Show day
          </button>
          {day && (
            <Link
              href={historyHref(pupilId, 1)}
              className="rounded-full border border-brand-100 bg-card px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink"
            >
              All days
            </Link>
          )}
        </div>
      </form>

      {day && (
        <p className="text-sm text-ink-muted" role="status">
          Showing {dayLabel(day.day)}.
        </p>
      )}

      {releases.length === 0 ? (
        <EmptyState
          title={page > 1 ? "No more pickups." : day ? "No pickups on this day." : "No pickups recorded yet."}
        >
          {page > 1 || day ? null : "When a pupil is collected at the gate, it will appear here."}
        </EmptyState>
      ) : (
        <ReleaseDays releases={releases} />
      )}

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm sm:justify-end">
          {page > 1 ? (
            <Link href={historyHref(pupilId, page - 1, undefined, day)} className="rounded-full border border-brand-100 bg-card px-4 py-2 font-medium hover:text-brand-700">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="px-2 text-ink-muted">Page {page}</span>
          {hasNext ? (
            <Link href={historyHref(pupilId, page + 1, undefined, day)} className="rounded-full border border-brand-100 bg-card px-4 py-2 font-medium hover:text-brand-700">
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

function ReleaseDays({ releases }: { releases: Release[] }) {
  // Days and times use the viewer's time zone, so they wait for the browser.
  const now = useNow();

  if (!now) {
    return (
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-4 w-20" />
        {releases.slice(0, 4).map((release) => (
          <div key={release.id} className="flex items-center gap-3 rounded-3xl border border-brand-100 bg-card p-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groupReleasesByDay(releases, now).map((day) => (
        <section key={day.key} aria-labelledby={`day-${day.key}`}>
          <h2 id={`day-${day.key}`} className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {day.label}
          </h2>
          <ul className="mt-3 overflow-hidden rounded-3xl border border-brand-100 bg-card shadow-sm">
            {day.releases.map((release) => (
              <li
                key={release.id}
                className="flex items-start gap-3 border-b border-line p-4 last:border-0 sm:grid sm:grid-cols-[2.25rem_minmax(0,1.2fr)_minmax(0,1.5fr)_8rem_5rem] sm:items-center sm:gap-4 sm:px-5"
              >
                <PupilAvatar pupil={release.pupil} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{pupilName(release.pupil)}</p>
                  <p className="truncate text-sm text-ink-muted sm:hidden">
                    Picked up by {release.authorisation.picker_name} · {formatTime(release.released_at)}
                  </p>
                  <p className="mt-1 sm:hidden">
                    <MethodBadge method={release.verification_method} />
                  </p>
                </div>
                <p className="hidden min-w-0 text-sm sm:block">
                  <span className="block truncate">{release.authorisation.picker_name}</span>
                  <span className="block truncate text-xs text-ink-muted">{release.authorisation.relationship}</span>
                </p>
                <p className="hidden sm:block">
                  <MethodBadge method={release.verification_method} />
                </p>
                <time dateTime={release.released_at} className="hidden text-right text-sm font-medium sm:block">
                  {formatTime(release.released_at)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MethodBadge({ method }: { method: Release["verification_method"] }) {
  return (
    <span className="inline-flex rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-600">
      Collected · {method === "qr" ? "QR code" : "Code entered"}
    </span>
  );
}
