import type { GetServerSideProps } from "next";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";

import { FormError, inputClass } from "@/components/AuthCard";
import { Icon } from "@/components/Icon";
import { ParentShell } from "@/components/ParentShell";
import { LoadError, PupilAvatar, Skeleton, StatusBadge } from "@/components/ParentUi";
import { OFFLINE, UNAVAILABLE } from "@/lib/api-errors";
import { BackendError, type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import {
  type PickupPerson,
  PUPIL_RECENT_RELEASES,
  type Pupil,
  type PupilForm,
  type Release,
  formatDate,
  formatDateTime,
  localIsoDate,
  pupilChanges,
  pupilForm,
  pupilName,
} from "@/lib/parent";
import { LOGIN_PATH } from "@/lib/roles";
import { useNow } from "@/lib/use-now";

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
            <PupilDetails pupil={pupil} onSaved={setPupil} />
          </div>
          <div className="space-y-6 lg:col-span-3">
            <PickupPeople people={data.people} />
            <RecentPickups releases={data.releases} />
          </div>
        </div>
      ) : (
        <LoadError message="We couldn't load this pupil." />
      )}
    </ParentShell>
  );
}

function PupilDetails({ pupil, onSaved }: { pupil: Pupil; onSaved: (pupil: Pupil) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PupilForm>(() => pupilForm(pupil));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function startEditing() {
    setForm(pupilForm(pupil));
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);

    const checked = pupilChanges(pupil, form, localIsoDate(new Date()));
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    if (Object.keys(checked.changes).length === 0) {
      setEditing(false);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/proxy/pupils/${pupil.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.changes),
      });

      if (response.ok) {
        onSaved(await response.json());
        setEditing(false);
        setSaved(true);
      } else if (response.status === 401) {
        window.location.assign(LOGIN_PATH);
      } else if (response.status === 404) {
        setError("This pupil is no longer linked to your account.");
      } else if (response.status === 422) {
        setError("Check the details and try again.");
      } else {
        setError(UNAVAILABLE);
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  const update = (field: keyof PupilForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <section aria-labelledby="details-heading" className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-4">
        <PupilAvatar pupil={pupil} />
        <h2 id="details-heading" className="font-semibold">
          Details
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="ml-auto rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Edit
          </button>
        )}
      </div>

      {saved && (
        <p role="status" className="mt-4 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-600">
          Pupil details saved.
        </p>
      )}

      {editing ? (
        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
          <FormError message={error} />
          <Field label="First name" id="first_name">
            <input id="first_name" className={inputClass} value={form.first_name} onChange={update("first_name")} maxLength={100} autoComplete="off" required />
          </Field>
          <Field label="Last name" id="last_name">
            <input id="last_name" className={inputClass} value={form.last_name} onChange={update("last_name")} maxLength={100} autoComplete="off" required />
          </Field>
          <Field label="Date of birth" id="date_of_birth">
            <input id="date_of_birth" type="date" className={inputClass} value={form.date_of_birth} onChange={update("date_of_birth")} required />
          </Field>
          <Field label="Photo link (optional)" id="photo_url">
            <input
              id="photo_url"
              type="url"
              inputMode="url"
              placeholder="https://"
              className={inputClass}
              value={form.photo_url}
              onChange={update("photo_url")}
              maxLength={500}
            />
          </Field>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-5 space-y-3 text-sm">
          <Row label="First name" value={pupil.first_name} />
          <Row label="Last name" value={pupil.last_name} />
          <Row label="Date of birth" value={formatDate(pupil.date_of_birth)} />
        </dl>
      )}
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function PickupPeople({ people }: { people: PickupPerson[] }) {
  return (
    <section aria-labelledby="people-heading" className="rounded-2xl border border-line bg-card shadow-sm">
      <h2 id="people-heading" className="px-5 pt-5 font-semibold sm:px-6">
        Pickup people
      </h2>
      {people.length === 0 ? (
        <p className="px-5 pt-2 pb-5 text-sm text-ink-muted sm:px-6">No pickup people for this pupil yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{person.picker_name}</p>
                <p className="truncate text-xs text-ink-muted">{person.relationship}</p>
              </div>
              <StatusBadge status={person.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentPickups({ releases }: { releases: Release[] }) {
  // Times use the viewer's time zone, so they wait for the browser.
  const now = useNow();

  return (
    <section aria-labelledby="recent-heading" className="rounded-2xl border border-line bg-card shadow-sm">
      <h2 id="recent-heading" className="px-5 pt-5 font-semibold sm:px-6">
        Recent pickups
      </h2>
      {releases.length === 0 ? (
        <p className="px-5 pt-2 pb-5 text-sm text-ink-muted sm:px-6">No pickups recorded yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {releases.map((release) => (
            <li key={release.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Picked up by {release.authorisation.picker_name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {release.authorisation.relationship} · {release.verification_method === "qr" ? "QR code" : "Code entered"}
                </p>
              </div>
              {now ? (
                <time dateTime={release.released_at} className="shrink-0 text-xs font-medium text-ink-muted">
                  {formatDateTime(release.released_at)}
                </time>
              ) : (
                <Skeleton className="h-3 w-20" />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
