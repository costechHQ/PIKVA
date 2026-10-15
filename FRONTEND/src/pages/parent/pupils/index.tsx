import type { GetServerSideProps } from "next";
import Link from "next/link";

import { ParentShell } from "@/components/ParentShell";
import { EmptyState, LoadError, PupilAvatar } from "@/components/ParentUi";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type PickupPerson, type Pupil, NO_PEOPLE, formatDate, peopleCountsByPupil, peopleCountsText, pupilName } from "@/lib/parent";

type Data = { pupils: Pupil[]; people: PickupPerson[] };

type Props = { user: CurrentUser; data: Data | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["parent"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  // FastAPI returns only this parent's pupils and pickup people.
  try {
    const [pupils, people] = await Promise.all([
      getAsUser<Pupil[]>(context, "pupils"),
      getAsUser<PickupPerson[]>(context, "pickers"),
    ]);
    return { props: { user, data: { pupils, people } } };
  } catch {
    return { props: { user, data: null } };
  }
};

/** The parent's pupils (SRS 18.9): view only here; editing is on each pupil's page. */
export default function ParentPupilsPage({ user, data }: Props) {
  return (
    <ParentShell user={user} title="My Pupils" subtitle="The pupils linked to your account.">
      {data ? <PupilList data={data} /> : <LoadError message="We couldn't load your pupils." />}
    </ParentShell>
  );
}

function PupilList({ data }: { data: Data }) {
  if (data.pupils.length === 0) {
    return (
      <EmptyState title="No pupils linked to your account yet.">
        Your school links pupils to your account. Contact the school if a pupil is missing.
      </EmptyState>
    );
  }

  const counts = peopleCountsByPupil(data.people);

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {data.pupils.map((pupil) => {
        const people = counts.get(pupil.id) ?? NO_PEOPLE;
        return (
          <li key={pupil.id}>
            <Link
              href={`/parent/pupils/${pupil.id}`}
              className="flex h-full items-center gap-4 rounded-2xl border border-line bg-card p-5 shadow-sm transition hover:border-brand-500 focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <PupilAvatar pupil={pupil} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{pupilName(pupil)}</span>
                <span className="block text-sm text-ink-muted">Born {formatDate(pupil.date_of_birth)}</span>
                <span className={`mt-1 block text-sm ${people.active === 0 ? "text-warning-600" : "text-ink-muted"}`}>
                  {peopleCountsText(people)}
                </span>
              </span>
              <span aria-hidden="true" className="text-ink-muted">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
