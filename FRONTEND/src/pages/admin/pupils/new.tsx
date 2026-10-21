import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type FormEvent, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FormError, inputClass } from "@/components/AuthCard";
import { Icon } from "@/components/Icon";
import { EmptyState, Field, LoadError } from "@/components/ParentUi";
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
import { sendAsUser } from "@/lib/parent-api";
import type { SchoolUser } from "@/lib/users";

type Props = { user: CurrentUser; parents: SchoolUser[] | null };

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

  // Keep the chosen parent in the list even when the filter would hide them.
  const shown = filterParents(parents, parentFilter);
  const chosen = parents.find((parent) => String(parent.id) === form.parent_id);
  const options = chosen && !shown.includes(chosen) ? [chosen, ...shown] : shown;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const checked = newPupilBody(form, localIsoDate(new Date()));
    if ("error" in checked) {
      setError(checked.error);
      return;
    }

    setError(null);
    setSaving(true);
    const result = await sendAsUser<Pupil>("pupils", "POST", checked.body, "That parent was not found.");

    if (result.ok) {
      await router.push(`/admin/pupils/${result.data.id}?added=1`);
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
        <Field label="Photo link (optional)" id="photo_url">
          <input id="photo_url" type="url" inputMode="url" placeholder="https://" className={inputClass} value={form.photo_url} onChange={update("photo_url")} maxLength={500} />
        </Field>
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
