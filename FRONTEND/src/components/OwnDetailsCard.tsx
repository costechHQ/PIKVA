/**
 * The signed-in user's details with an Edit form for name and phone
 * (SRS 6.9), shared by Parent Settings and the staff Account page. The
 * email is shown but never edited here.
 */
import { useRouter } from "next/router";
import { type FormEvent, useState } from "react";

import { FormError, inputClass } from "@/components/AuthCard";
import { Field, SuccessNote } from "@/components/ParentUi";
import { OFFLINE, UNAVAILABLE, detailText } from "@/lib/api-errors";
import type { CurrentUser } from "@/lib/auth-guard";
import { type OwnDetailsForm, ownDetailsChanges } from "@/lib/own-details";
import { LOGIN_PATH } from "@/lib/roles";

export function OwnDetailsCard({
  user,
  extraRows = [],
  emailNote,
}: {
  user: CurrentUser;
  /** More read-only rows after the editable ones, such as Role or School. */
  extraRows?: readonly (readonly [string, string])[];
  /** Who to ask about changing the email. */
  emailNote: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OwnDetailsForm>({ name: user.name, phone: user.phone ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function startEditing() {
    setForm({ name: user.name, phone: user.phone ?? "" });
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const checked = ownDetailsChanges(user, form);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    if (Object.keys(checked.body).length === 0) {
      setEditing(false);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.body),
      });
      if (response.ok) {
        setEditing(false);
        setSaved(true);
        // Reload the page's data so the new name shows everywhere, top bar included.
        void router.replace(router.asPath, undefined, { scroll: false });
      } else if (response.status === 401) {
        window.location.assign(LOGIN_PATH);
      } else {
        const body = await response.json().catch(() => null);
        setError(response.status === 422 ? (detailText(body) ?? "Check your details and try again.") : UNAVAILABLE);
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  const update = (field: keyof OwnDetailsForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <section aria-labelledby="details-heading" className="rounded-3xl border border-brand-100 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="details-heading" className="font-semibold">
          Your details
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="rounded-full border border-brand-100 px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Edit
          </button>
        )}
      </div>

      <div className="mt-4">
        <SuccessNote message={saved ? "Your details were saved." : null} />
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <FormError message={error} />
          <Field label="Full name" id="own-name">
            <input id="own-name" className={inputClass} value={form.name} onChange={update("name")} maxLength={150} autoComplete="name" required />
          </Field>
          <Field label="Phone number" id="own-phone">
            <input id="own-phone" type="tel" inputMode="tel" className={inputClass} value={form.phone} onChange={update("phone")} maxLength={30} autoComplete="tel" required />
          </Field>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-brand-600 shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-full border border-brand-100 px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-2 divide-y divide-line text-sm">
          {(
            [
              ["Name", user.name],
              ["Phone", user.phone ?? "Not set"],
              ["Email", user.email],
              ...extraRows,
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="min-w-0 break-words font-medium sm:text-right">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-4 text-xs text-ink-muted">{emailNote}</p>
    </section>
  );
}
