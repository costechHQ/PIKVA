/**
 * Change password while signed in (SRS 6.8), shared by Parent Settings and
 * the staff Account page. The new token stays in the httpOnly cookie, so
 * this browser stays signed in; other devices are signed out.
 */
import { type FormEvent, useState } from "react";

import { FormError, inputClass } from "@/components/AuthCard";
import { Field, SuccessNote } from "@/components/ParentUi";
import { OFFLINE } from "@/lib/api-errors";
import { type PasswordChangeForm, passwordChangeBody, passwordChangeError } from "@/lib/change-password";
import { LOGIN_PATH } from "@/lib/roles";

const EMPTY: PasswordChangeForm = { current: "", next: "", confirm: "" };

export function ChangePasswordForm() {
  const [form, setForm] = useState<PasswordChangeForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChanged(false);

    const checked = passwordChangeBody(form);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.body),
      });
      if (response.ok) {
        setForm(EMPTY);
        setChanged(true);
      } else if (response.status === 401) {
        window.location.assign(LOGIN_PATH);
      } else {
        const body = await response.json().catch(() => null);
        setError(passwordChangeError(response.status, body, response.headers.get("Retry-After")));
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setSaving(false);
    }
  }

  const update = (field: keyof PasswordChangeForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
      <FormError message={error} />
      <SuccessNote message={changed ? "Password changed. You have been signed out on your other devices." : null} />
      <Field label="Current password" id="current-password">
        <input id="current-password" type="password" autoComplete="current-password" className={inputClass} value={form.current} onChange={update("current")} maxLength={128} required />
      </Field>
      <Field label="New password" id="new-password">
        <input id="new-password" type="password" autoComplete="new-password" className={inputClass} value={form.next} onChange={update("next")} maxLength={128} required />
      </Field>
      <Field label="New password again" id="confirm-password">
        <input id="confirm-password" type="password" autoComplete="new-password" className={inputClass} value={form.confirm} onChange={update("confirm")} maxLength={128} required />
      </Field>
      <p className="text-xs text-ink-muted">Changing your password signs you out on your other devices. We email you a notice.</p>
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-brand-600 shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {saving ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
