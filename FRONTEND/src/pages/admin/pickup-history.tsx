import type { GetServerSideProps } from "next";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { inputClass } from "@/components/AuthCard";
import { DayField } from "@/components/DayField";
import { LoadError, PupilAvatar, Skeleton } from "@/components/ParentUi";
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

const BASE = "/admin/pickup-history";

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
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  // FastAPI returns the admin's whole school, newest first.
  try {
    const pupils = await getAsUser<Pupil[]>(context, "pupils");
    const pupilId = parsePupilFilter(context.query.pupil, pupils);
    const date = parseDay(context.query.date);
    // The browser sends its time zone with the date (see DayField), so "a day" is the viewer's day.
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

/** Every release at the school for admins (SRS 12, 18.8): who, by whom, how and when. */
export default function AdminPickupHistoryPage({ user, data }: Props) {
  return (
    <AppShell user={user} title="Pickup History" subtitle={`Every pupil released at ${user.school_name}, newest first.`}>
      {data ? <History data={data} /> : <LoadError message="We couldn't load the pickup history." />}
    </AppShell>
  );
}

function History({ data }: { data: Data }) {
  const { pupils, releases, pupilId, day, page, hasNext } = data;
  const pupil = pupils.find((p) => p.id === pupilId);
  const filtered = pupil !== undefined || day !== null;

  return (
    <div className="space-y-6">
      {/* A plain GET form, so the filter works before scripts load. */}
      <form method="get" className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="lg:w-64">
          <label htmlFor="pupil" className="mb-1.5 block text-sm font-medium">
            Pupil
          </label>
          <select id="pupil" name="pupil" defaultValue={pupilId ?? ""} className={inputClass}>
            <option value="">All pupils</option>
            {pupils.map((p) => (
              <option key={p.id} value={p.id}>
                {pupilName(p)}
              </option>
            ))}
          </select>
        </div>
        <DayField day={day?.day ?? ""} className="lg:w-48" />
        <div className="flex gap-2">
          <button type="submit" className="rounded-full bg-brand-600 shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            Show
          </button>
          {filtered && (
            <Link href={BASE} className="rounded-full border border-brand-100 bg-card px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink">
              Clear
            </Link>
          )}
        </div>
      </form>

      {day && (
        <p className="text-sm text-ink-muted" role="status">
          Showing {dayLabel(day.day)}
          {pupil ? ` for ${pupilName(pupil)}` : ""}.
        </p>
      )}

      {releases.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-ink-muted">
          {page > 1
            ? "No more pickups."
            : day
              ? "No pickups recorded on this day."
              : pupil
                ? `No pickups recorded for ${pupil.first_name} yet.`
                : "No pickups recorded yet."}
        </p>
      ) : (
        <ReleaseDays releases={releases} />
      )}

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm sm:justify-end">
          {page > 1 ? (
            <Link href={historyHref(pupilId, page - 1, BASE, day)} className="rounded-full border border-brand-100 bg-card px-4 py-2 font-medium hover:text-brand-700">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="px-2 text-ink-muted">Page {page}</span>
          {hasNext ? (
            <Link href={historyHref(pupilId, page + 1, BASE, day)} className="rounded-full border border-brand-100 bg-card px-4 py-2 font-medium hover:text-brand-700">
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
        <Skeleton className="h-40 w-full rounded-xl" />
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
          <div className="mt-3 overflow-x-auto rounded-2xl border border-brand-100 bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-brand-100 bg-brand-50 text-xs font-semibold text-navy-900">
                <tr>
                  <th scope="col" className="w-24 px-4 py-3 font-medium">Time</th>
                  <th scope="col" className="px-4 py-3 font-medium">Pupil</th>
                  <th scope="col" className="px-4 py-3 font-medium">Collected by</th>
                  <th scope="col" className="px-4 py-3 font-medium">Released by</th>
                  <th scope="col" className="px-4 py-3 font-medium">Method</th>
                </tr>
              </thead>
              <tbody>
                {day.releases.map((release) => (
                  <tr key={release.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <time dateTime={release.released_at}>{formatTime(release.released_at)}</time>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/pupils/${release.pupil.id}`} className="group flex items-center gap-3">
                        <PupilAvatar pupil={release.pupil} size="sm" />
                        <span className="font-medium text-brand-600 group-hover:text-brand-700 group-hover:underline">
                          {pupilName(release.pupil)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{release.authorisation.picker_name}</span>
                      <span className="block text-xs text-ink-muted">{release.authorisation.relationship}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{release.verified_by?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-600">
                        {release.verification_method === "qr" ? "QR code" : "Code entered"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
