import type { GetServerSideProps } from "next";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { FormError, inputClass } from "@/components/AuthCard";
import { ParentShell } from "@/components/ParentShell";
import { EmptyState, Field, LoadError, PupilAvatar, Skeleton, StatusBadge, SuccessNote } from "@/components/ParentUi";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type PickupPerson, type Pupil, formatDateTime, pupilName } from "@/lib/parent";
import { sendAsUser } from "@/lib/parent-api";
import {
  type PersonForm,
  type PickupCode,
  TYPE_SUGGESTIONS,
  changeMessage,
  emptyPersonForm,
  formatCode,
  personBody,
  personForm,
} from "@/lib/pickup-people";
import { encodeQr } from "@/lib/qr";
import { useNow } from "@/lib/use-now";

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

/** Pickup people (SRS 9, 18.5, 18.9): list, add, edit, activate and deactivate. */
export default function PickupPeoplePage({ user, data }: Props) {
  return (
    <ParentShell
      user={user}
      title="Pickup People"
      subtitle="The people allowed to collect your pupils from school."
    >
      {data ? <PickupPeopleManager data={data} /> : <LoadError message="We couldn't load your pickup people." />}
    </ParentShell>
  );
}

type Editor = { kind: "add"; pupilId: number | null } | { kind: "edit"; person: PickupPerson } | null;

function PickupPeopleManager({ data }: { data: Data }) {
  const [people, setPeople] = useState(data.people);
  const [editor, setEditor] = useState<Editor>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (data.pupils.length === 0) {
    return (
      <EmptyState title="No pupils linked to your account yet.">
        Pickup people are added for a pupil, so your school needs to link a pupil to your account first.
      </EmptyState>
    );
  }

  function saved(person: PickupPerson, message: string) {
    setPeople((current) =>
      current.some((p) => p.id === person.id) ? current.map((p) => (p.id === person.id ? person : p)) : [...current, person],
    );
    setEditor(null);
    setNotice(message);
  }

  function openEditor(next: Editor) {
    setNotice(null);
    setEditor(next);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-ink-muted">
          A pickup person can collect a pupil only once your school has approved them, while they are active and
          within their dates. Your school can also see and update them.
        </p>
        {!editor && (
          <button
            type="button"
            onClick={() => openEditor({ kind: "add", pupilId: data.pupils.length === 1 ? data.pupils[0].id : null })}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add pickup person
          </button>
        )}
      </div>

      <SuccessNote message={notice} />

      {editor && (
        <PersonEditor
          key={editor.kind === "edit" ? `edit-${editor.person.id}` : `add-${editor.pupilId}`}
          editor={editor}
          pupils={data.pupils}
          onCancel={() => setEditor(null)}
          onSaved={saved}
        />
      )}

      {data.pupils.map((pupil) => {
        const forPupil = people.filter((person) => person.pupil_id === pupil.id);
        return (
          <section key={pupil.id} id={`pupil-${pupil.id}`} aria-labelledby={`pupil-${pupil.id}-heading`} className="scroll-mt-20">
            <div className="flex items-center gap-3">
              <PupilAvatar pupil={pupil} size="sm" />
              <h2 id={`pupil-${pupil.id}-heading`} className="min-w-0 flex-1 truncate text-lg font-semibold">
                {pupilName(pupil)}
              </h2>
              {!editor && (
                <button
                  type="button"
                  onClick={() => openEditor({ kind: "add", pupilId: pupil.id })}
                  className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-brand-600 hover:border-brand-500"
                >
                  Add
                </button>
              )}
            </div>
            {forPupil.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-line bg-card p-5 text-sm text-ink-muted">
                No pickup people for {pupil.first_name} yet.
              </p>
            ) : (
              <ul className="mt-3 grid gap-4 md:grid-cols-2">
                {forPupil.map((person) => (
                  <li key={person.id}>
                    <PersonCard
                      person={person}
                      pupil={pupil}
                      editing={editor !== null}
                      onEdit={() => openEditor({ kind: "edit", person })}
                      onChanged={saved}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PersonCard({
  person,
  pupil,
  editing,
  onEdit,
  onChanged,
}: {
  person: PickupPerson;
  pupil: Pupil;
  editing: boolean;
  onEdit: () => void;
  onChanged: (person: PickupPerson, message: string) => void;
}) {
  // Dates use the viewer's time zone, so they wait for the browser.
  const now = useNow();
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
      "This pickup person is no longer linked to your account.",
    );
    setBusy(false);
    setConfirming(false);

    if (result.ok) {
      onChanged(result.data, changeMessage(result.data, active ? "activated" : "deactivated"));
    } else {
      setError(result.message);
    }
  }

  return (
    <article className="h-full rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{person.picker_name}</h3>
          <p className="truncate text-sm text-ink-muted">
            {person.relationship} · {person.type}
          </p>
        </div>
        <StatusBadge status={person.status} />
      </div>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-ink-muted">Phone</dt>
          <dd className="min-w-0 truncate">
            <a href={`tel:${person.picker_phone}`} className="font-medium text-brand-600 hover:text-brand-700">
              {person.picker_phone}
            </a>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-ink-muted">From</dt>
          <dd>{now ? formatDateTime(person.starts_at) : <Skeleton className="mt-1 h-3 w-28" />}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-ink-muted">Until</dt>
          <dd>{now ? formatDateTime(person.expires_at) : <Skeleton className="mt-1 h-3 w-28" />}</dd>
        </div>
      </dl>

      {error && <div className="mt-4"><FormError message={error} /></div>}

      {person.status === "pending_approval" && (
        <p className="mt-4 rounded-xl bg-warning-50 p-3 text-sm">
          Waiting for your school to approve {person.picker_name}. You can get a pickup code once they do.
        </p>
      )}

      {/* Not hidden while another form is open, so a shown code is never lost by accident. */}
      {person.status === "active" && !confirming && <TodaysCode person={person} pupil={pupil} />}

      {confirming ? (
        <div className="mt-4 rounded-xl bg-danger-50 p-3">
          <p className="text-sm">
            Deactivate {person.picker_name}? They will not be able to collect {pupil.first_name} until you activate them again.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void setActive(false)}
              disabled={busy}
              className="rounded-lg bg-danger-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Deactivating…" : "Deactivate"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        !editing && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Edit
            </button>
            {person.is_active ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-danger-600 hover:border-danger-600"
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void setActive(true)}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-success-600 hover:border-success-600 disabled:opacity-60"
              >
                {busy ? "Activating…" : "Activate"}
              </button>
            )}
          </div>
        )
      )}
    </article>
  );
}

function PersonEditor({
  editor,
  pupils,
  onCancel,
  onSaved,
}: {
  editor: NonNullable<Editor>;
  pupils: Pupil[];
  onCancel: () => void;
  onSaved: (person: PickupPerson, message: string) => void;
}) {
  const original = editor.kind === "edit" ? editor.person : undefined;
  const [form, setForm] = useState<PersonForm>(() =>
    original ? personForm(original) : emptyPersonForm(editor.kind === "add" ? editor.pupilId : null, new Date()),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panel = useRef<HTMLFormElement>(null);

  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const checked = personBody(form, new Date(), original);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    if (original && Object.keys(checked.body).length === 0) {
      onCancel();
      return;
    }

    setError(null);
    setSaving(true);
    const result = original
      ? await sendAsUser<PickupPerson>(
          `pickers/${original.id}`,
          "PATCH",
          checked.body,
          "This pickup person is no longer linked to your account.",
        )
      : await sendAsUser<PickupPerson>("pickers", "POST", checked.body, "That pupil is not linked to your account.");
    setSaving(false);

    if (result.ok) {
      onSaved(result.data, changeMessage(result.data, original ? "updated" : "added"));
    } else {
      setError(result.message);
    }
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
        {original ? `Edit ${original.picker_name}` : "Add a pickup person"}
      </h2>

      <p className="mt-2 text-sm text-ink-muted">
        {!original
          ? "Your school will approve this person before they can collect."
          : original.approved_at
            ? `If you save changes, ${original.picker_name} cannot collect until your school approves them again, and any code you already got for them will stop working.`
            : `${original.picker_name} is still waiting for your school's approval.`}
      </p>

      <div className="mt-4">
        <FormError message={error} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {!original && (
          <div className="sm:col-span-2">
            <Field label="Pupil" id="pupil_id">
              <select id="pupil_id" className={inputClass} value={form.pupil_id} onChange={update("pupil_id")} required>
                <option value="">Choose a pupil</option>
                {pupils.map((pupil) => (
                  <option key={pupil.id} value={pupil.id}>
                    {pupilName(pupil)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Full name" id="picker_name">
          <input id="picker_name" className={inputClass} value={form.picker_name} onChange={update("picker_name")} maxLength={150} autoComplete="off" required />
        </Field>
        <Field label="Phone number" id="picker_phone">
          <input id="picker_phone" type="tel" inputMode="tel" className={inputClass} value={form.picker_phone} onChange={update("picker_phone")} maxLength={30} autoComplete="off" required />
        </Field>
        <Field label="Relationship to pupil" id="relationship">
          <input id="relationship" placeholder="e.g. Uncle, Grandmother, Driver" className={inputClass} value={form.relationship} onChange={update("relationship")} maxLength={50} required />
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
          <p className="mt-1.5 text-xs text-ink-muted">A photo helps gate staff recognise this person.</p>
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
          {saving ? "Saving…" : original ? "Save changes" : "Add pickup person"}
        </button>
      </div>
    </form>
  );
}

/**
 * The code as a QR for the gate scanner. Drawn in the browser from the
 * code's qr_data, which never leaves this page; the encoder loads on demand.
 */
function QrImage({ text, label }: { text: string; label: string }) {
  const [qr, setQr] = useState<{ size: number; path: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    encodeQr(text)
      .then((result) => current && setQr(result))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [text]);

  if (failed) return null;
  return (
    <div className="mt-4 inline-block rounded-xl bg-white p-2">
      {qr ? (
        <svg role="img" aria-label={label} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" className="h-44 w-44 text-navy-900">
          <path d={qr.path} fill="currentColor" />
        </svg>
      ) : (
        <span aria-hidden="true" className="block h-44 w-44 animate-pulse rounded-lg bg-surface" />
      )}
    </div>
  );
}

/**
 * Today's pickup code for an active pickup person (SRS 10, 18.9). The backend
 * shows a code only once and getting a new one expires any earlier unused
 * code, so the parent confirms first. The code lives only in this
 * component's memory: never stored, never put in the URL.
 */
function TodaysCode({ person, pupil }: { person: PickupPerson; pupil: Pupil }) {
  const [step, setStep] = useState<"idle" | "confirm" | "shown">("idle");
  const [code, setCode] = useState<PickupCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function getCode() {
    setBusy(true);
    setError(null);
    const result = await sendAsUser<PickupCode>(
      "pickup/codes",
      "POST",
      { authorisation_id: person.id },
      "This pickup person is no longer linked to your account.",
      "code requests",
    );
    setBusy(false);

    if (result.ok) {
      setCode(result.data);
      setStep("shown");
    } else {
      setError(result.message);
      setStep("idle");
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function hide() {
    setCode(null);
    setCopied(false);
    setStep("idle");
  }

  if (step === "shown" && code) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-brand-600 p-5 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-accent-400">Today&apos;s pickup code</p>
        <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.2em] sm:text-4xl" aria-label={`Code ${code.code.split("").join(" ")}`}>
          {formatCode(code.code)}
        </p>
        <p className="mt-2 text-sm text-white/80">
          For {person.picker_name} to collect {pupil.first_name}. Works once, until {formatDateTime(code.expires_at)}.
        </p>
        <QrImage text={code.qr_data} label={`QR code for ${person.picker_name}'s pickup code`} />
        <p className="mt-2 text-xs text-white/70">Gate staff can scan this QR code or type the code above.</p>
        <p className="mt-3 text-xs text-white/70">
          Share it only with {person.picker_name}. It will not be shown again; if it is lost, get a new code.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-navy-900 hover:bg-brand-50"
          >
            {copied ? "Copied" : "Copy code"}
          </button>
          <button
            type="button"
            onClick={hide}
            className="rounded-lg border border-white/30 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Hide
          </button>
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="mt-4 rounded-xl border border-warning-600/30 bg-warning-50 p-4">
        <p className="text-sm font-medium">Get a new pickup code for {person.picker_name}?</p>
        <p className="mt-1 text-sm text-ink-muted">
          Any earlier code for {person.picker_name} that has not been used will stop working. The code is shown once
          and works for one pickup today.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void getCode()}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Getting code…" : "Get new code"}
          </button>
          <button
            type="button"
            onClick={() => setStep("idle")}
            disabled={busy}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {error && <FormError message={error} />}
      <button
        type="button"
        onClick={() => setStep("confirm")}
        className={`${error ? "mt-3 " : ""}w-full rounded-lg bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-100`}
      >
        Get today&apos;s code
      </button>
    </div>
  );
}
