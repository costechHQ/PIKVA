import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { ParentShell } from "@/components/ParentShell";
import { LoadError } from "@/components/ParentUi";
import { PickupPeopleList, PupilDetails, RecentPickups } from "@/components/PupilPanels";
import { BackendError, type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type PickupPerson, PUPIL_RECENT_RELEASES, type Pupil, type Release, pupilName } from "@/lib/parent";

type Data = { pupil: Pupil; people: PickupPerson[]; releases: Release[] };

type Props = { user: CurrentUser; data: Data | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["parent"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  const id = typeof context.params?.id === "string" ? context.params.id : "";
  if (!/^\d{1,9}$/.test(id)) return { notFound: true };

  // FastAPI answers 404 for a pupil that is not this parent's, so another
  // family's pupil looks exactly like one that does not exist.
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

/** One pupil (SRS 18.9): details the parent can edit, pickup people and recent pickups. */
export default function ParentPupilPage(props: Props) {
  // Keyed by pupil, so moving between pupils never keeps the previous one's state.
  return <PupilPage key={props.data?.pupil.id ?? "error"} {...props} />;
}

function PupilPage({ user, data }: Props) {
  const [pupil, setPupil] = useState(data?.pupil ?? null);

  return (
    <ParentShell user={user} title={pupil ? pupilName(pupil) : "Pupil"}>
      <Link href="/parent/pupils" className="-mt-4 mb-6 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
        <Icon name="back" className="h-4 w-4" />
        My Pupils
      </Link>
      {data && pupil ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <PupilDetails pupil={pupil} onSaved={setPupil} notFound="This pupil is no longer linked to your account." />
          </div>
          <div className="space-y-6 lg:col-span-3">
            <PickupPeopleList
              people={data.people}
              action={{ href: `/parent/pickup-people#pupil-${pupil.id}`, label: "Manage" }}
            />
            <RecentPickups releases={data.releases} />
          </div>
        </div>
      ) : (
        <LoadError message="We couldn't load this pupil." />
      )}
    </ParentShell>
  );
}
