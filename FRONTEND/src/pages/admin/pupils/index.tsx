import type { GetServerSideProps } from "next";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { inputClass } from "@/components/AuthCard";
import { LoadError, PupilAvatar } from "@/components/ParentUi";
import { parseSearch, searchPupils } from "@/lib/admin-pupils";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import {
  NO_PEOPLE,
  type PeopleCounts,
  type PickupPerson,
  type Pupil,
  formatDate,
  peopleCountsByPupil,
  peopleCountsText,
  pupilName,
} from "@/lib/parent";

type Row = { pupil: Pupil; people: PeopleCounts };

type Props = { user: CurrentUser; search: string; rows: Row[] | null; total: number };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;
  const search = parseSearch(context.query.q);

  // FastAPI returns the admin's whole school, pupils sorted by surname.
  try {
    const [pupils, people] = await Promise.all([
      getAsUser<Pupil[]>(context, "pupils"),
      getAsUser<PickupPerson[]>(context, "pickers"),
    ]);
    const counts = peopleCountsByPupil(people);
    const rows = searchPupils(pupils, search).map((pupil) => ({ pupil, people: counts.get(pupil.id) ?? NO_PEOPLE }));
    return { props: { user, search, rows, total: pupils.length } };
  } catch {
    return { props: { user, search, rows: null, total: 0 } };
  }
};

/** School pupils for admins (SRS 18.4): search by pupil or parent name. */
export default function AdminPupilsPage({ user, search, rows, total }: Props) {
  return (
    <AppShell user={user} title="Pupils" subtitle={`Pupils at ${user.school_name} and who collects them`}>
      {rows ? <PupilTable rows={rows} search={search} total={total} /> : <LoadError message="We couldn't load the pupils." />}
    </AppShell>
  );
}

function PupilTable({ rows, search, total }: { rows: Row[]; search: string; total: number }) {
  return (
    <>
      {/* A plain GET form: the server filters, so search works before scripts load. */}
      <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="q" className="sr-only">
          Search pupils
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Search by pupil or parent name"
          maxLength={100}
          className={`${inputClass} sm:max-w-sm`}
        />
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            Search
          </button>
          {search && (
            <Link href="/admin/pupils" className="rounded-lg border border-line bg-card px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="mt-4 text-sm text-ink-muted" role="status">
        {search ? `${rows.length} of ${total} pupils match "${search}".` : `${total} ${total === 1 ? "pupil" : "pupils"}`}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs font-medium text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Pupil</th>
              <th scope="col" className="px-4 py-3 font-medium">Date of birth</th>
              <th scope="col" className="px-4 py-3 font-medium">Parent</th>
              <th scope="col" className="px-4 py-3 font-medium">Pickup people</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pupil, people }) => (
              <tr key={pupil.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-3">
                    <PupilAvatar pupil={pupil} size="sm" />
                    <span className="font-medium">{pupilName(pupil)}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-muted">{formatDate(pupil.date_of_birth)}</td>
                <td className="px-4 py-3">
                  <span className="block">{pupil.parent.name}</span>
                  <a href={`tel:${pupil.parent.phone}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    {pupil.parent.phone}
                  </a>
                </td>
                <td className={`px-4 py-3 ${people.active === 0 ? "text-warning-600" : "text-ink-muted"}`}>
                  {peopleCountsText(people)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            {search ? "No pupils match this search." : "No pupils at this school yet."}
          </p>
        )}
      </div>
    </>
  );
}
