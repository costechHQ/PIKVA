import type { GetServerSideProps } from "next";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FormError, inputClass } from "@/components/AuthCard";
import { Field, LoadError, Skeleton, StatusBadge, SuccessNote } from "@/components/ParentUi";
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
import { sendAsUser } from "@/lib/parent-api";
import { type PersonForm, TYPE_SUGGESTIONS, personBody, personForm } from "@/lib/pickup-people";
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
  rows: initialRows,
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
  // Rows change in place after an action; the filter is applied again on the next load.
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function changed(person: PickupPerson, message: string) {
    setRows((current) => current.map((row) => (row.person.id === person.id ? { ...row, person } : row)));
    setEditing(null);
    setNotice(message);
  }

  function startEditing(row: PersonRow) {
    setNotice(null);
    setEditing(row);
  }

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

      <div className="mt-4 space-y-4">
        <SuccessNote message={notice} />
        {editing && (
          <AdminPersonEditor
            key={editing.person.id}
            row={editing}
            onCancel={() => setEditing(null)}
            onSaved={(person) => changed(person, `${person.picker_name} updated.`)}
          />
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-line text-xs font-medium text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Pickup person</th>
              <th scope="col" className="px-4 py-3 font-medium">Collects</th>
              <th scope="col" className="px-4 py-3 font-medium">Phone</th>
              <th scope="col" className="px-4 py-3 font-medium">Valid</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { person, pupil } = row;
              return (
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
                <td className="px-4 py-3">
                  <RowActions
                    person={person}
                    pupilText={pupil ? pupilName(pupil) : "the pupil"}
                    editingAnother={editing !== null}
                    onEdit={() => startEditing(row)}
                    onChanged={changed}
                  />
                </td>
              </tr>
              );
            })}
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

/** Edit, and Deactivate (after confirming) or Activate, for one row. */
function RowActions({
  person,
  pupilText,
  editingAnother,
  onEdit,
  onChanged,
}: {
  person: PickupPerson;
  pupilText: string;
  editingAnother: boolean;
  onEdit: () => void;
  onChanged: (person: PickupPerson, message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setActive(active: boolean) {
    setBusy(true);
    setError(null);
    const result = await sendAsUser<PickupPerson>(
      `pickers/${person.id}/${active ? "activate" : "deactivate"}`,
      "POST",
      undefined,
      "This pickup person no longer exists.",
    );
    setBusy(false);
    setConfirming(false);

    if (result.ok) onChanged(result.data, `${person.picker_name} ${active ? "activated" : "deactivated"}.`);
    else setError(result.message);
  }

  if (confirming) {
    return (
      <div className="w-56 space-y-2">
        <p className="text-xs">
          Deactivate {person.picker_name}? They cannot collect {pupilText}, even with a code already issued.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void setActive(false)}
            disabled={busy}
            className="rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {busy ? "Deactivating…" : "Deactivate"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        {!editingAnother && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Edit
          </button>
        )}
        {person.is_active ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-danger-600 hover:border-danger-600"
          >
            Deactivate
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void setActive(true)}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-success-600 hover:border-success-600 disabled:opacity-60"
          >
            {busy ? "Activating…" : "Activate"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="max-w-56 text-right text-xs text-danger-600">{error}</p>}
    </div>
  );
}

/**
 * Edit a pickup person's details and dates. Admin edits keep the school's
 * approval (SRS 9.2), so only the changed fields are sent.
 */
function AdminPersonEditor({
  row: { person, pupil },
  onCancel,
  onSaved,
}: {
  row: PersonRow;
  onCancel: () => void;
  onSaved: (person: PickupPerson) => void;
}) {
  const [form, setForm] = useState<PersonForm>(() => personForm(person));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panel = useRef<HTMLFormElement>(null);

  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const checked = personBody(form, new Date(), person);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    if (Object.keys(checked.body).length === 0) {
      onCancel();
      return;
    }

    setError(null);
    setSaving(true);
    const result = await sendAsUser<PickupPerson>(
      `pickers/${person.id}`,
      "PATCH",
      checked.body,
      "This pickup person no longer exists.",
    );
    setSaving(false);

    if (result.ok) onSaved(result.data);
    else setError(result.message);
  }

  const update = (field: keyof PersonForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form
      ref={panel}
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="editor-heading"
      className="scroll-mt-20 rounded-2xl border border-brand-100 bg-card p-5 shadow-sm ring-4 ring-brand-50 sm:p-6"
    >
      <h2 id="editor-heading" className="text-lg font-semibold">
        Edit {person.picker_name}
        {pupil && <span className="font-normal text-ink-muted"> · collects {pupilName(pupil)}</span>}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        Your changes keep the school&apos;s approval, and a code the parent already has keeps working. To stop someone
        collecting, deactivate them instead.
      </p>

      <div className="mt-4">
        <FormError message={error} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Full name" id="picker_name">
          <input id="picker_name" className={inputClass} value={form.picker_name} onChange={update("picker_name")} maxLength={150} autoComplete="off" required />
        </Field>
        <Field label="Phone number" id="picker_phone">
          <input id="picker_phone" type="tel" inputMode="tel" className={inputClass} value={form.picker_phone} onChange={update("picker_phone")} maxLength={30} autoComplete="off" required />
        </Field>
        <Field label="Relationship to pupil" id="relationship">
          <input id="relationship" className={inputClass} value={form.relationship} onChange={update("relationship")} maxLength={50} required />
        </Field>
        <Field label="Type" id="type">
          <input id="type" list="type-suggestions" className={inputClass} value={form.type} onChange={update("type")} maxLength={50} required />
          <datalist id="type-suggestions">
            {TYPE_SUGGESTIONS.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </Field>
        <Field label="Can collect from" id="starts_at">
          <input id="starts_at" type="datetime-local" className={inputClass} value={form.starts_at} onChange={update("starts_at")} required />
        </Field>
        <Field label="Until" id="expires_at">
          <input id="expires_at" type="datetime-local" className={inputClass} value={form.expires_at} onChange={update("expires_at")} required />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Photo link (optional)" id="photo_url">
            <input id="photo_url" type="url" inputMode="url" placeholder="https://" className={inputClass} value={form.photo_url} onChange={update("photo_url")} maxLength={500} />
          </Field>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
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
