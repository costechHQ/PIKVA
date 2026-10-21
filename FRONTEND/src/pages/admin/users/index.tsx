import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FormError, inputClass } from "@/components/AuthCard";
import { Field, SuccessNote } from "@/components/ParentUi";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { ROLE_LABEL } from "@/lib/navigation";
import { sendAsUser } from "@/lib/parent-api";
import type { Role } from "@/lib/roles";
import {
  ROLE_FILTERS,
  type SchoolUser,
  type SetupEmailResult,
  USERS_PAGE_SIZE,
  type UserContact,
  isManageable,
  parsePage,
  parseRoleFilter,
  setupEmailPath,
  setupLinkMessage,
  userChanges,
  usersApiPath,
  usersPageHref,
} from "@/lib/users";

type Props = {
  user: CurrentUser;
  users: SchoolUser[];
  role: Role | null;
  page: number;
  hasNext: boolean;
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;

  const role = parseRoleFilter(context.query.role);
  const page = parsePage(context.query.page);
  const rows = await getAsUser<SchoolUser[]>(context, usersApiPath(role, page));

  return {
    props: {
      user: (await guard.props).user,
      users: rows.slice(0, USERS_PAGE_SIZE),
      role,
      page,
      hasNext: rows.length > USERS_PAGE_SIZE,
    },
  };
};

const ROLE_BADGE: Record<Role, string> = {
  school_admin: "bg-navy-900/10 text-navy-900",
  gate_staff: "bg-warning-50 text-warning-600",
  parent: "bg-brand-50 text-brand-700",
};

const NOT_FOUND = "This user is no longer in your school.";

/** School users for admins (SRS 6.7): filter by role, page by 50, edit and deactivate. */
export default function UsersPage({ user, users, role, page, hasNext }: Props) {
  return (
    <AppShell user={user} title="Users" subtitle={`Parents, gate staff and administrators at ${user.school_name}`}>
      <div className="mb-4 flex justify-end">
        <Link
          href={role === "parent" || role === "gate_staff" ? `/admin/users/new?role=${role}` : "/admin/users/new"}
          className="rounded-full bg-brand-600 shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Add user
        </Link>
      </div>
      <nav aria-label="Filter by role" className="flex flex-wrap gap-2">
        {ROLE_FILTERS.map((filter) => {
          const active = filter.role === role;
          return (
            <Link
              key={filter.label}
              href={usersPageHref(filter.role, 1)}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                active ? "bg-brand-600 text-white" : "border border-line bg-card text-ink-muted hover:text-ink"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      <UserTable initialUsers={users} page={page} />

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-end gap-2 text-sm">
          {page > 1 && (
            <Link href={usersPageHref(role, page - 1)} className="rounded-full border border-brand-100 bg-card px-3 py-1.5 hover:text-brand-700">
              Previous
            </Link>
          )}
          <span className="px-2 text-ink-muted">Page {page}</span>
          {hasNext && (
            <Link href={usersPageHref(role, page + 1)} className="rounded-full border border-brand-100 bg-card px-3 py-1.5 hover:text-brand-700">
              Next
            </Link>
          )}
        </nav>
      )}
    </AppShell>
  );
}

function UserTable({ initialUsers, page }: { initialUsers: SchoolUser[]; page: number }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [editing, setEditing] = useState<SchoolUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Fresh rows from a reload replace the local copy (set during render, as React recommends).
  const [shownUsers, setShownUsers] = useState(initialUsers);
  if (initialUsers !== shownUsers) {
    setShownUsers(initialUsers);
    setUsers(initialUsers);
  }

  function changed(updated: SchoolUser, message: string) {
    setUsers((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    setEditing(null);
    setNotice(message);
    void router.replace(router.asPath, undefined, { scroll: false });
  }

  return (
    <>
      <div className="mt-4 space-y-4">
        <SuccessNote message={notice} />
        {editing && (
          <UserEditor
            key={editing.id}
            user={editing}
            onCancel={() => setEditing(null)}
            onSaved={(updated) => changed(updated, `${updated.name} updated.`)}
          />
        )}
      </div>

      {/* Below xl the table would not fit beside the sidebar, so each user is a card. */}
      <ul className="mt-4 space-y-3 xl:hidden">
        {users.map((row) => (
          <li
            key={row.id}
            className={`rounded-2xl border border-brand-100 p-4 shadow-sm ${row.is_active ? "bg-card" : "bg-surface/60"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words font-semibold text-navy-900">{row.name}</p>
              <StatusBadge active={row.is_active} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-ink-muted">Email</dt>
                <dd className="min-w-0 break-all">{row.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-ink-muted">Phone</dt>
                <dd className="min-w-0 break-words">{row.phone}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="w-14 shrink-0 text-ink-muted">Role</dt>
                <dd>
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${ROLE_BADGE[row.role] ?? ""}`}>
                    {ROLE_LABEL[row.role] ?? row.role}
                  </span>
                </dd>
              </div>
            </dl>
            {isManageable(row) && (
              <div className="mt-4 border-t border-line pt-3">
                <UserActions
                  user={row}
                  editingAnother={editing !== null}
                  onEdit={() => {
                    setNotice(null);
                    setEditing(row);
                  }}
                  onChanged={changed}
                  onNotice={setNotice}
                  align="start"
                />
              </div>
            )}
          </li>
        ))}
        {users.length === 0 && <EmptyRows page={page} />}
      </ul>

      {/* relative: keeps the visually hidden "Actions" header inside the scroll box. */}
      <div className="relative mt-4 hidden overflow-x-auto rounded-2xl border border-brand-100 bg-card xl:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-brand-100 bg-brand-50 text-xs font-semibold text-navy-900">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Name</th>
              <th scope="col" className="px-4 py-3 font-medium">Email</th>
              <th scope="col" className="px-4 py-3 font-medium">Phone</th>
              <th scope="col" className="px-4 py-3 font-medium">Role</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className={`border-b border-line last:border-0 ${row.is_active ? "" : "bg-surface/60"}`}>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-ink-muted">{row.email}</td>
                <td className="px-4 py-3 text-ink-muted">{row.phone}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${ROLE_BADGE[row.role] ?? ""}`}>
                    {ROLE_LABEL[row.role] ?? row.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge active={row.is_active} />
                </td>
                <td className="px-4 py-3">
                  {isManageable(row) && (
                    <UserActions
                      user={row}
                      editingAnother={editing !== null}
                      onEdit={() => {
                        setNotice(null);
                        setEditing(row);
                      }}
                      onChanged={changed}
                      onNotice={setNotice}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <EmptyRows page={page} />}
      </div>
    </>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="shrink-0 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-600">Active</span>
  ) : (
    <span className="shrink-0 rounded-full bg-danger-50 px-2.5 py-0.5 text-xs font-medium text-danger-600">Inactive</span>
  );
}

function EmptyRows({ page }: { page: number }) {
  return (
    <p className="px-4 py-10 text-center text-sm text-ink-muted">
      {page > 1 ? "No more users." : "No users match this filter yet."}
    </p>
  );
}

/**
 * Edit, Send link (a new set-password link, SRS 6.7), and Deactivate (after
 * confirming) or Activate, for one parent or gate staff member.
 */
function UserActions({
  user,
  editingAnother,
  onEdit,
  onChanged,
  onNotice,
  align = "end",
}: {
  user: SchoolUser;
  editingAnother: boolean;
  onEdit: () => void;
  onChanged: (user: SchoolUser, message: string) => void;
  onNotice: (message: string | null) => void;
  /** "start" in the phone cards, "end" in the table's last column. */
  align?: "start" | "end";
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
    setSending(true);
    setError(null);
    onNotice(null);
    const result = await sendAsUser<SetupEmailResult>(setupEmailPath(user.id), "POST", undefined, NOT_FOUND, "set-password links");
    setSending(false);

    if (!result.ok) setError(result.message);
    else if (result.data.email_sent) onNotice(setupLinkMessage(user, true));
    else setError(setupLinkMessage(user, false));
  }

  async function setActive(active: boolean) {
    setBusy(true);
    setError(null);
    const result = await sendAsUser<SchoolUser>(
      `schools/users/${user.id}/${active ? "activate" : "deactivate"}`,
      "POST",
      undefined,
      NOT_FOUND,
    );
    setBusy(false);
    setConfirming(false);

    if (result.ok) onChanged(result.data, `${user.name} ${active ? "activated. They can sign in again." : "deactivated."}`);
    else setError(result.message);
  }

  if (confirming) {
    return (
      <div className="w-full space-y-2 sm:w-72">
        <p className="text-xs">
          Deactivate {user.name}? They are signed out now and cannot sign in until you activate them again.
          {user.role === "parent" &&
            " Their pickup people and any code already issued keep working: deactivate those on Pickup People if they should not collect."}
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
            className="rounded-full border border-brand-100 px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}`}>
      <div className={`flex flex-wrap gap-2 ${align === "end" ? "justify-end" : "justify-start"}`}>
        {!editingAnother && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-brand-100 px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Edit
          </button>
        )}
        {user.is_active && (
          <button
            type="button"
            onClick={() => void sendLink()}
            disabled={sending}
            aria-label={`Send ${user.name} a set-password link`}
            title="Email a new link to set their password"
            className="rounded-full border border-brand-100 px-3 py-1.5 text-xs font-medium text-brand-600 hover:border-brand-500 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send link"}
          </button>
        )}
        {user.is_active ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-full border border-brand-100 px-3 py-1.5 text-xs font-medium text-danger-600 hover:border-danger-600"
          >
            Deactivate
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void setActive(true)}
            disabled={busy}
            className="rounded-full border border-brand-100 px-3 py-1.5 text-xs font-medium text-success-600 hover:border-success-600 disabled:opacity-60"
          >
            {busy ? "Activating…" : "Activate"}
          </button>
        )}
      </div>
      {error && <p role="alert" className={`max-w-64 text-xs text-danger-600 ${align === "end" ? "text-right" : "text-left"}`}>{error}</p>}
    </div>
  );
}

/** Change a user's name, email or phone. Only changed fields are sent. */
function UserEditor({
  user,
  onCancel,
  onSaved,
}: {
  user: SchoolUser;
  onCancel: () => void;
  onSaved: (user: SchoolUser) => void;
}) {
  const [form, setForm] = useState<UserContact>({ name: user.name, email: user.email, phone: user.phone });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panel = useRef<HTMLFormElement>(null);

  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const checked = userChanges(user, form);
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
    const result = await sendAsUser<SchoolUser>(`schools/users/${user.id}`, "PATCH", checked.body, NOT_FOUND);
    setSaving(false);

    if (result.ok) onSaved(result.data);
    else setError(result.message);
  }

  const update = (field: keyof UserContact) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <form
      ref={panel}
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="edit-user-heading"
      className="scroll-mt-20 max-w-2xl rounded-2xl border border-brand-100 bg-card p-5 shadow-sm ring-4 ring-brand-50 sm:p-6"
    >
      <h2 id="edit-user-heading" className="text-lg font-bold text-navy-900">
        Edit {user.name}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        A new email becomes the one they sign in with. Their password and role do not change.
      </p>

      <div className="mt-4">
        <FormError message={error} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Full name" id="edit-name">
            <input id="edit-name" className={inputClass} value={form.name} onChange={update("name")} maxLength={150} autoComplete="off" required />
          </Field>
        </div>
        <Field label="Email" id="edit-email">
          <input id="edit-email" type="email" inputMode="email" className={inputClass} value={form.email} onChange={update("email")} maxLength={255} autoComplete="off" required />
        </Field>
        <Field label="Phone number" id="edit-phone">
          <input id="edit-phone" type="tel" inputMode="tel" className={inputClass} value={form.phone} onChange={update("phone")} maxLength={30} autoComplete="off" required />
        </Field>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full border border-brand-100 px-4 py-2.5 text-sm font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-brand-600 shadow-md shadow-brand-600/25 transition hover:-translate-y-0.5 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
