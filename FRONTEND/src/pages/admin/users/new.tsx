import type { GetServerSideProps } from "next";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FormError, inputClass } from "@/components/AuthCard";
import { Icon } from "@/components/Icon";
import { Field } from "@/components/ParentUi";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";
import { sendAsUser } from "@/lib/parent-api";
import {
  CREATABLE_ROLES,
  type CreatedSchoolUser,
  type NewUserForm,
  type SetupEmailResult,
  newUserBody,
  parseCreatableRole,
  setupEmailPath,
  setupLinkMessage,
} from "@/lib/users";

type Props = { user: CurrentUser; role: "parent" | "gate_staff" | "" };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  return { props: { user: (await guard.props).user, role: parseCreatableRole(context.query.role) } };
};

/**
 * Add a parent or gate staff account (SRS 6.7). The admin never sets a
 * password: the backend emails the new user a link to choose one.
 */
export default function NewUserPage({ user, role }: Props) {
  const [added, setAdded] = useState<CreatedSchoolUser | null>(null);
  // Remounting the form clears it for "Add another".
  const [formKey, setFormKey] = useState(0);

  return (
    <AppShell user={user} title="Add user" subtitle={`Add a parent or gate staff member at ${user.school_name}.`}>
      <Link href="/admin/users" className="-mt-2 mb-6 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
        <Icon name="back" className="h-4 w-4" />
        Users
      </Link>
      {added ? (
        <Added
          added={added}
          onAnother={() => {
            setAdded(null);
            setFormKey((key) => key + 1);
          }}
        />
      ) : (
        <NewUserFormCard key={formKey} initialRole={role} onAdded={setAdded} />
      )}
    </AppShell>
  );
}

function NewUserFormCard({ initialRole, onAdded }: { initialRole: string; onAdded: (user: CreatedSchoolUser) => void }) {
  const [form, setForm] = useState<NewUserForm>({ name: "", email: "", phone: "", role: initialRole });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const checked = newUserBody(form);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }

    setError(null);
    setSaving(true);
    const result = await sendAsUser<CreatedSchoolUser>("schools/users", "POST", checked.body, "Users cannot be added right now.");
    setSaving(false);

    if (result.ok) onAdded(result.data);
    else setError(result.message);
  }

  const update = (field: keyof NewUserForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-2xl rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
      <FormError message={error} />

      <fieldset>
        <legend className="text-sm font-semibold">Role</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CREATABLE_ROLES.map((option) => (
            <label
              key={option.role}
              className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${
                form.role === option.role ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-500"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={option.role}
                checked={form.role === option.role}
                onChange={update("role")}
                className="mt-1 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-ink-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Full name" id="name">
            <input id="name" className={inputClass} value={form.name} onChange={update("name")} maxLength={150} autoComplete="off" required />
          </Field>
        </div>
        <Field label="Email" id="email">
          <input id="email" type="email" inputMode="email" className={inputClass} value={form.email} onChange={update("email")} maxLength={255} autoComplete="off" required />
        </Field>
        <Field label="Phone number" id="phone">
          <input id="phone" type="tel" inputMode="tel" className={inputClass} value={form.phone} onChange={update("phone")} maxLength={30} autoComplete="off" required />
        </Field>
      </div>

      <p className="mt-4 text-sm text-ink-muted">
        You don&apos;t choose a password. Pikva emails them a link to set their own; it works once, for 30 minutes.
      </p>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/admin/users" className="rounded-lg border border-line px-4 py-2.5 text-center text-sm font-medium text-ink-muted hover:text-ink">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add user"}
        </button>
      </div>
    </form>
  );
}

function Added({ added, onAnother }: { added: CreatedSchoolUser; onAnother: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the confirmation so screen readers announce it.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section role="status" className="max-w-2xl rounded-2xl border border-success-600/30 bg-success-50 p-5 sm:p-6">
      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold text-success-600 outline-none">
        {added.name} added as {added.role === "parent" ? "a parent" : "gate staff"}
      </h2>
      {added.setup_email_sent ? (
        <p className="mt-2 text-sm">
          A link to set their password has been sent to <span className="font-medium">{added.email}</span>. It works
          once, for 30 minutes. If it doesn&apos;t arrive or expires, use &quot;Send link&quot; on Users, or they can use
          &quot;Forgot password?&quot; on the sign-in page.
        </p>
      ) : (
        <ResendSetupLink user={added} />
      )}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onAnother}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Add another
        </button>
        {added.role === "parent" && (
          <Link href="/admin/pupils/new" className="rounded-lg border border-line bg-card px-4 py-2.5 text-center text-sm font-medium hover:text-brand-700">
            Add their pupil
          </Link>
        )}
        <Link href="/admin/users" className="rounded-lg border border-line bg-card px-4 py-2.5 text-center text-sm font-medium hover:text-brand-700">
          Back to Users
        </Link>
      </div>
    </section>
  );
}

/**
 * The account exists but its set-password email did not go out (SRS 6.7):
 * say so plainly and offer to try again.
 */
function ResendSetupLink({ user }: { user: CreatedSchoolUser }) {
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

  async function retry() {
    setSending(true);
    setOutcome(null);
    const result = await sendAsUser<SetupEmailResult>(
      setupEmailPath(user.id),
      "POST",
      undefined,
      "This user is no longer in your school.",
      "set-password links",
    );
    setSending(false);

    if (!result.ok) setOutcome({ ok: false, message: result.message });
    else setOutcome({ ok: result.data.email_sent, message: setupLinkMessage(user, result.data.email_sent) });
  }

  if (outcome?.ok) {
    return <p className="mt-2 text-sm">{outcome.message}</p>;
  }

  return (
    <div className="mt-3 rounded-xl border border-warning-600/30 bg-warning-50 p-4 text-sm text-ink">
      <p className="font-medium">The account was created, but the set-password email could not be sent.</p>
      <p className="mt-1">
        {user.name} can&apos;t sign in until they set a password. Check that <span className="font-medium">{user.email}</span>{" "}
        is right and try again, or ask them to use &quot;Forgot password?&quot; on the sign-in page.
      </p>
      {outcome && (
        <p role="alert" className="mt-2 text-danger-600">
          {outcome.message}
        </p>
      )}
      <button
        type="button"
        onClick={() => void retry()}
        disabled={sending}
        className="mt-3 rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium text-brand-600 hover:border-brand-500 disabled:opacity-60"
      >
        {sending ? "Sending…" : "Try sending again"}
      </button>
    </div>
  );
}
