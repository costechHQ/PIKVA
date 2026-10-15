import type { GetServerSideProps } from "next";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { inputClass } from "@/components/AuthCard";
import { LoadError, Skeleton, StatusBadge } from "@/components/ParentUi";
import {
  type PersonRow,
  STATUS_FILTERS,
  filterPersonRows,
  parseStatusFilter,
  peopleHref,
  personRows,
  statusCounts,
} from "@/lib/admin-pickup-people";
import { parseSearch } from "@/lib/admin-pupils";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type AuthorisationStatus, type PickupPerson, type Pupil, formatDateTime, pupilName } from "@/lib/parent";
import { useNow } from "@/lib/use-now";

type Props = {
  user: CurrentUser;
  status: AuthorisationStatus | null;
  search: string;
  data: { rows: PersonRow[]; counts: [AuthorisationStatus, number][]; total: number } | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;
  const status = parseStatusFilter(context.query.status);
  const search = parseSearch(context.query.q);

  // FastAPI returns every pickup person and pupil in the admin's school.
  try {
    const [people, pupils] = await Promise.all([
      getAsUser<PickupPerson[]>(context, "pickers"),
      getAsUser<Pupil[]>(context, "pupils"),
    ]);
    const all = personRows(people, pupils);
    return {
      props: {
        user,
        status,
        search,
        data: { rows: filterPersonRows(all, status, search), counts: [...statusCounts(all)], total: all.length },
      },
    };
  } catch {
    return { props: { user, status, search, data: null } };
  }
};

/** Every pickup person in the school for admins (SRS 18.5). Parents add them; staff never do. */
export default function AdminPickupPeoplePage({ user, status, search, data }: Props) {
  return (
    <AppShell user={user} title="Pickup People" subtitle="Everyone parents have allowed to collect pupils.">
      {data ? (
        <PeopleTable status={status} search={search} {...data} />
      ) : (
        <LoadError message="We couldn't load the pickup people." />
      )}
    </AppShell>
  );
}

function PeopleTable({
  status,
  search,
  rows,
  counts,
  total,
}: {
  status: AuthorisationStatus | null;
  search: string;
  rows: PersonRow[];
  counts: [AuthorisationStatus, number][];
  total: number;
}) {
  const countOf = new Map(counts);
  const waiting = countOf.get("pending_approval") ?? 0;

  return (
    <>
      {waiting > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warning-50 px-4 py-3 text-sm">
          <span>
            {waiting} {waiting === 1 ? "person is" : "people are"} waiting for approval.
          </span>
          <Link href="/admin/approvals" className="font-medium text-brand-600 hover:text-brand-700">
            Review approvals
          </Link>
        </p>
      )}

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const active = filter.status === status;
          const count = filter.status ? (countOf.get(filter.status) ?? 0) : total;
          return (
            <Link
              key={filter.label}
              href={peopleHref(filter.status, search)}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                active ? "bg-brand-600 text-white" : "border border-line bg-card text-ink-muted hover:text-ink"
              }`}
            >
              {filter.label} <span className={active ? "text-white/80" : "text-ink-muted"}>{count}</span>
            </Link>
          );
        })}
      </nav>

      {/* A plain GET form: the server filters, so search works before scripts load. */}
      <form method="get" role="search" className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="q" className="sr-only">
          Search pickup people
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Search by person, phone or pupil"
          maxLength={100}
          className={`${inputClass} sm:max-w-sm`}
        />
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            Search
          </button>
          {search && (
            <Link href={peopleHref(status, "")} className="rounded-lg border border-line bg-card px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink">
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-xs font-medium text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Pickup person</th>
              <th scope="col" className="px-4 py-3 font-medium">Collects</th>
              <th scope="col" className="px-4 py-3 font-medium">Phone</th>
              <th scope="col" className="px-4 py-3 font-medium">Valid</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ person, pupil }) => (
              <tr key={person.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="block font-medium">{person.picker_name}</span>
                  <span className="block text-xs text-ink-muted">
                    {person.relationship} · {person.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {pupil ? (
                    <Link href={`/admin/pupils/${pupil.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                      {pupilName(pupil)}
                    </Link>
                  ) : (
                    <span className="text-ink-muted">Unknown pupil</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a href={`tel:${person.picker_phone}`} className="text-brand-600 hover:text-brand-700">
                    {person.picker_phone}
                  </a>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  <ValidDates person={person} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={person.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            {search || status ? "No pickup people match this filter." : "No pickup people yet. Parents add them from their account."}
          </p>
        )}
      </div>
    </>
  );
}

/** From and until, in the viewer's time zone, so they wait for the browser. */
function ValidDates({ person }: { person: PickupPerson }) {
  const now = useNow();
  if (!now) return <Skeleton className="h-8 w-32" />;
  return (
    <>
      <span className="block">From {formatDateTime(person.starts_at)}</span>
      <span className="block">Until {formatDateTime(person.expires_at)}</span>
    </>
  );
}
