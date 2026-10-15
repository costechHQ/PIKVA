import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { LoadError } from "@/components/ParentUi";
import { PickupPeopleList, PupilDetails, RecentPickups } from "@/components/PupilPanels";
import { BackendError, type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type PickupPerson, PUPIL_RECENT_RELEASES, type Pupil, type PupilParent, type Release, pupilName } from "@/lib/parent";

type Data = { pupil: Pupil; people: PickupPerson[]; releases: Release[] };

type Props = { user: CurrentUser; data: Data | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  const id = typeof context.params?.id === "string" ? context.params.id : "";
  if (!/^\d{1,9}$/.test(id)) return { notFound: true };

  // FastAPI answers 404 for a pupil in another school.
  try {
    const [pupil, people, releases] = await Promise.all([
      getAsUser<Pupil>(context, `pupils/${id}`),
      getAsUser<PickupPerson[]>(context, `pickers?pupil_id=${id}`),
      getAsUser<Release[]>(context, `releases?pupil_id=${id}&limit=${PUPIL_RECENT_RELEASES}`),
    ]);
    return { props: { user, data: { pupil, people, releases } } };
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) return { notFound: true };
    return { props: { user, data: null } };
  }
};

/** One pupil for admins (SRS 18.4): editable details, parent contact, pickup people and recent pickups. */
export default function AdminPupilPage(props: Props) {
  // Keyed by pupil, so moving between pupils never keeps the previous one's state.
  return <PupilPage key={props.data?.pupil.id ?? "error"} {...props} />;
}

function PupilPage({ user, data }: Props) {
  const [pupil, setPupil] = useState(data?.pupil ?? null);
  const waiting = data?.people.some((person) => person.status === "pending_approval") ?? false;

  return (
    <AppShell user={user} title={pupil ? pupilName(pupil) : "Pupil"}>
      <Link href="/admin/pupils" className="-mt-2 mb-6 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
        <Icon name="back" className="h-4 w-4" />
        Pupils
      </Link>
      {data && pupil ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            <PupilDetails pupil={pupil} onSaved={setPupil} notFound="This pupil no longer exists." />
            <ParentCard parent={pupil.parent} />
          </div>
          <div className="space-y-6 lg:col-span-3">
            <PickupPeopleList
              people={data.people}
              action={waiting ? { href: "/admin/approvals", label: "Review approvals" } : undefined}
            />
            <RecentPickups releases={data.releases} showStaff />
          </div>
        </div>
      ) : (
        <LoadError message="We couldn't load this pupil." />
      )}
    </AppShell>
  );
}

function ParentCard({ parent }: { parent: PupilParent }) {
  return (
    <section aria-labelledby="parent-heading" className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
      <h2 id="parent-heading" className="font-semibold">
        Parent
      </h2>
      <p className="mt-3 font-medium">{parent.name}</p>
      <p className="mt-1 flex flex-col gap-1 text-sm">
        <a href={`tel:${parent.phone}`} className="font-medium text-brand-600 hover:text-brand-700">
          {parent.phone}
        </a>
        <a href={`mailto:${parent.email}`} className="truncate font-medium text-brand-600 hover:text-brand-700">
          {parent.email}
        </a>
      </p>
    </section>
  );
}
