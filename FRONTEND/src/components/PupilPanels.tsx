/**
 * Panels of a pupil page, shared by the parent portal (SRS 18.9) and the
 * admin pupil page (SRS 18.4): editable details, pickup people and recent
 * pickups. Each page passes what differs for its role.
 */
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { FormError, inputClass } from "@/components/AuthCard";
import { Field, PupilAvatar, Skeleton, StatusBadge, SuccessNote } from "@/components/ParentUi";
import {
  type PickupPerson,
  type Pupil,
  type PupilForm,
  type Release,
  formatDate,
  formatDateTime,
  localIsoDate,
  pupilChanges,
  pupilForm,
} from "@/lib/parent";
import { sendAsUser } from "@/lib/parent-api";
import { useNow } from "@/lib/use-now";

/** The pupil's details with an Edit form. notFound is the message if the pupil is gone when saving. */
export function PupilDetails({
  pupil,
  onSaved,
  notFound,
}: {
  pupil: Pupil;
  onSaved: (pupil: Pupil) => void;
  notFound: string;
}) {
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
    const result = await sendAsUser<Pupil>(`pupils/${pupil.id}`, "PATCH", checked.changes, notFound);
    setSaving(false);

    if (result.ok) {
      onSaved(result.data);
      setEditing(false);
      setSaved(true);
    } else {
      setError(result.message);
    }
  }

  const update = (field: keyof PupilForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <section aria-labelledby="details-heading" className="rounded-3xl border border-brand-100 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-4">
        <PupilAvatar pupil={pupil} />
        <h2 id="details-heading" className="font-semibold">
          Details
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="ml-auto rounded-full border border-brand-100 px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Edit
          </button>
        )}
      </div>

      <div className="mt-4">
        <SuccessNote message={saved ? "Pupil details saved." : null} />
      </div>

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
              className="flex-1 rounded-full bg-brand-600 shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex-1 rounded-full border border-brand-100 px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-5 space-y-3 text-sm">
          <DetailRow label="First name" value={pupil.first_name} />
          <DetailRow label="Last name" value={pupil.last_name} />
          <DetailRow label="Date of birth" value={formatDate(pupil.date_of_birth)} />
        </dl>
      )}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/** The pupil's pickup people with their status. action is an optional link beside the heading. */
export function PickupPeopleList({
  people,
  action,
}: {
  people: PickupPerson[];
  action?: { href: string; label: string };
}) {
  return (
    <section aria-labelledby="people-heading" className="rounded-3xl border border-brand-100 bg-card shadow-sm">
      <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
        <h2 id="people-heading" className="font-semibold">
          Pickup people
        </h2>
        {action && (
          <Link href={action.href} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            {action.label}
          </Link>
        )}
      </div>
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

/**
 * The pupil's latest pickups. showStaff adds who released the pupil; only
 * staff pages pass it, since parents are not shown staff names.
 */
export function RecentPickups({ releases, showStaff = false }: { releases: Release[]; showStaff?: boolean }) {
  // Times use the viewer's time zone, so they wait for the browser.
  const now = useNow();

  return (
    <section aria-labelledby="recent-heading" className="rounded-3xl border border-brand-100 bg-card shadow-sm">
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
                  {showStaff && release.verified_by && ` · released by ${release.verified_by.name}`}
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
