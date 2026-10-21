import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FormError, inputClass } from "@/components/AuthCard";
import { Icon } from "@/components/Icon";
import { EmptyState, Field, LoadError, PhotoOrInitials } from "@/components/ParentUi";
import {
  EMPTY_NEW_PUPIL,
  type NewPupilForm,
  PARENTS_API_PATH,
  PARENTS_LIMIT,
  filterParents,
  newPupilBody,
} from "@/lib/admin-pupils";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type Pupil, localIsoDate } from "@/lib/parent";
import { sendAsUser, sendPupilPhoto } from "@/lib/parent-api";
import { PHOTO_ACCEPT, photoFileError } from "@/lib/photos";
import type { SchoolUser } from "@/lib/users";

type Props = { user: CurrentUser; parents: SchoolUser[] | null };

/** A photo picked in the browser, with a preview address to show it. */
type ChosenPhoto = { file: File; preview: string };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  // FastAPI returns this school's parents only, sorted by name.
  try {
    return { props: { user, parents: await getAsUser<SchoolUser[]>(context, PARENTS_API_PATH) } };
  } catch {
    return { props: { user, parents: null } };
  }
};

/** Add a pupil for one of the school's parents (SRS 18.4). */
export default function NewPupilPage({ user, parents }: Props) {
  return (
    <AppShell user={user} title="Add pupil" subtitle="Add a pupil and link them to their parent's account.">
      <Link href="/admin/pupils" className="-mt-2 mb-6 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
        <Icon name="back" className="h-4 w-4" />
        Pupils
      </Link>
      {parents === null ? (
        <LoadError message="We couldn't load the school's parents." />
      ) : parents.length === 0 ? (
        <EmptyState title="No parent accounts yet.">
          A pupil is linked to a parent, so{" "}
          <Link href="/admin/users/new?role=parent" className="font-medium text-brand-600 hover:text-brand-700">
            add the parent
          </Link>{" "}
          first.
        </EmptyState>
      ) : (
        <NewPupilFormCard parents={parents} />
      )}
    </AppShell>
  );
}

function NewPupilFormCard({ parents }: { parents: SchoolUser[] }) {
  const router = useRouter();
  const [form, setForm] = useState<NewPupilForm>(EMPTY_NEW_PUPIL);
  const [parentFilter, setParentFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<ChosenPhoto | null>(null);

  // A preview holds the chosen file in memory until it is released.
  const preview = photo?.preview ?? null;
  useEffect(() => (preview ? () => URL.revokeObjectURL(preview) : undefined), [preview]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // Choosing the same file again still counts.
    if (!file) return;

    const problem = photoFileError(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPhoto({ file, preview: URL.createObjectURL(file) });
  }

  // Keep the chosen parent in the list even when the filter would hide them.
  const shown = filterParents(parents, parentFilter);
  const chosen = parents.find((parent) => String(parent.id) === form.parent_id);
  const options = chosen && !shown.includes(chosen) ? [chosen, ...shown] : shown;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // An uploaded photo replaces the link, so the link is not sent with it.
    const checked = newPupilBody(photo ? { ...form, photo_url: "" } : form, localIsoDate(new Date()));
    if ("error" in checked) {
      setError(checked.error);
      return;
    }

    setError(null);
    setSaving(true);
    const result = await sendAsUser<Pupil>("pupils", "POST", checked.body, "That parent was not found.");

    if (result.ok) {
      // The pupil exists now, so a failed upload still goes on to their page, with a warning.
      const uploaded = photo ? await sendPupilPhoto(result.data.id, photo.file) : null;
      const query = uploaded && !uploaded.ok ? "added=1&photo=failed" : "added=1";
      await router.push(`/admin/pupils/${result.data.id}?${query}`);
    } else {
      setSaving(false);
      setError(result.message);
    }
  }

  const update = (field: keyof NewPupilForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-2xl rounded-3xl border border-brand-100 bg-card p-5 shadow-sm sm:p-6">
      <FormError message={error} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Parent</legend>
        <Field label="Find a parent" id="parent_filter">
          <input
            id="parent_filter"
            type="search"
            placeholder="Name, email or phone"
            className={inputClass}
            value={parentFilter}
            onChange={(event) => setParentFilter(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Parent" id="parent_id">
          <select id="parent_id" className={inputClass} value={form.parent_id} onChange={update("parent_id")} required>
            <option value="">
              {options.length === 0 ? "No parents match" : `Choose a parent (${options.length})`}
            </option>
            {options.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name} · {parent.email}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-ink-muted">
          Parent not listed?{" "}
          <Link href="/admin/users/new?role=parent" className="font-medium text-brand-600 hover:text-brand-700">
            Add a parent
          </Link>{" "}
          first, then come back.
        </p>
        {parents.length >= PARENTS_LIMIT && (
          <p className="text-xs text-warning-600">
            Only the first {PARENTS_LIMIT} parents by name can be chosen here for now.
          </p>
        )}
      </fieldset>

      <fieldset className="mt-6 grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Pupil</legend>
        <Field label="First name" id="first_name">
          <input id="first_name" className={inputClass} value={form.first_name} onChange={update("first_name")} maxLength={100} autoComplete="off" required />
        </Field>
        <Field label="Last name" id="last_name">
          <input id="last_name" className={inputClass} value={form.last_name} onChange={update("last_name")} maxLength={100} autoComplete="off" required />
        </Field>
        <Field label="Date of birth" id="date_of_birth">
          <input id="date_of_birth" type="date" className={inputClass} value={form.date_of_birth} onChange={update("date_of_birth")} required />
        </Field>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium">Photo (optional)</p>
          <div className="mt-2 flex items-center gap-4">
            <PhotoOrInitials
              src={photo?.preview ?? null}
              name={`${form.first_name} ${form.last_name}`.trim() || "Pupil"}
              alt={photo ? "Preview of the chosen photo" : ""}
              className="h-20 w-20 shrink-0 rounded-2xl"
              initialsClassName="bg-surface text-xl text-ink-muted"
            />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap gap-2">
                {/* A label, so the file input itself stays the keyboard and screen reader target. */}
                <label
                  className={`cursor-pointer rounded-full border border-brand-100 px-3 py-2 text-sm font-medium text-brand-600 hover:border-brand-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${saving ? "pointer-events-none opacity-60" : ""}`}
                >
                  {photo ? "Choose another photo" : "Upload photo"}
                  <input type="file" accept={PHOTO_ACCEPT} className="sr-only" onChange={choosePhoto} disabled={saving} />
                </label>
                {photo && (
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    disabled={saving}
                    className="rounded-full border border-brand-100 px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink"
                  >
                    Don&apos;t use this photo
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-muted">A clear photo of their face. JPEG, PNG or WebP, up to 5 MB.</p>
            </div>
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field label="Or use a photo link instead" id="photo_url">
            <input
              id="photo_url"
              type="url"
              inputMode="url"
              placeholder="https://"
              className={`${inputClass} disabled:opacity-60`}
              value={photo ? "" : form.photo_url}
              onChange={update("photo_url")}
              maxLength={500}
              disabled={photo !== null}
            />
          </Field>
          {photo && <p className="mt-1 text-xs text-ink-muted">The uploaded photo is used instead of a link.</p>}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/admin/pupils" className="rounded-full border border-brand-100 px-4 py-2.5 text-center text-sm font-medium text-ink-muted hover:text-ink">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-brand-600 shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add pupil"}
        </button>
      </div>
    </form>
  );
}
