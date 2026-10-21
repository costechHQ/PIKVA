import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FormError, inputClass } from "@/components/AuthCard";
import { Field, SuccessNote } from "@/components/ParentUi";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/navigation";
import { sendAsUser } from "@/lib/parent-api";
import type { Role } from "@/lib/roles";
import {
  ROLE_FILTERS,
  type SchoolUser,
  type SetupEmailResult,
  USERS_PAGE_SIZE,
  USER_SEARCH_MAX,
  type UserContact,
  isManageable,
  parsePage,
  parseRoleFilter,
  parseUserSearch,
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
  search: string;
  page: number;
  hasNext: boolean;
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;

  const role = parseRoleFilter(context.query.role);
  const page = parsePage(context.query.page);
  const search = parseUserSearch(context.query.q);
  const rows = await getAsUser<SchoolUser[]>(context, usersApiPath(role, page, search));

  return {
    props: {
      user: (await guard.props).user,
      users: rows.slice(0, USERS_PAGE_SIZE),
      role,
      search,
      page,
      hasNext: rows.length > USERS_PAGE_SIZE,
    },
  };
};

/** Role pill colours and the avatar behind each person's initials. */
const ROLE_BADGE: Record<Role, string> = {
  school_admin: "bg-navy-900/10 text-navy-900",
  gate_staff: "bg-warning-50 text-warning-600",
  parent: "bg-brand-50 text-brand-700",
};

const ROLE_AVATAR: Record<Role, string> = {
  school_admin: "bg-gradient-to-br from-navy-700 to-navy-900 text-white",
  gate_staff: "bg-sun-100 text-sun-500",
  parent: "bg-brand-100 text-brand-700",
};

const NOT_FOUND = "This user is no longer in your school.";

const PAGER_LINK =
  "inline-flex h-10 items-center rounded-full border border-brand-100 bg-card px-4 text-sm font-medium text-navy-900 shadow-sm transition hover:-translate-y-0.5 hover:text-brand-700";

/** School users for admins (SRS 6.7): search by name or email, filter by role, page by 50, edit and deactivate. */
export default function UsersPage({ user, users, role, search, page, hasNext }: Props) {
  return (
    <AppShell user={user} title="Users" subtitle={"Parents, gate staff and administrators at " + user.school_name}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* A plain GET form: the server searches, so it works before scripts load. */}
        <form method="get" role="search" className="relative w-full lg:max-w-md">
          {role && <input type="hidden" name="role" value={role} />}
          <label htmlFor="q" className="sr-only">
            Search users
          </label>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Search by name or email"
            maxLength={USER_SEARCH_MAX}
            className="h-12 w-full rounded-full border border-brand-100 bg-card pl-12 pr-28 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
          <div className="absolute inset-y-1 right-1 flex items-center gap-1">
            {search && (
              <Link href={usersPageHref(role, 1)} className="rounded-full px-2 py-2 text-xs font-medium text-ink-muted hover:text-ink">
                Clear
              </Link>
            )}
            <button
              type="submit"
              className="h-10 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Search
            </button>
          </div>
        </form>

        <Link
          href={role === "parent" || role === "gate_staff" ? "/admin/users/new?role=" + role : "/admin/users/new"}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5 hover:bg-brand-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add user
        </Link>
      </div>

      <nav
        aria-label="Filter by role"
        className="mt-5 flex max-w-full gap-1 overflow-x-auto rounded-full border border-brand-100 bg-card p-1 shadow-sm sm:inline-flex"
      >
        {ROLE_FILTERS.map((filter) => {
          const active = filter.role === role;
          return (
            <Link
              key={filter.label}
              href={usersPageHref(filter.role, 1, search)}
              aria-current={active ? "page" : undefined}
              className={
                "flex-1 whitespace-nowrap rounded-full px-4 py-2 text-center text-sm font-medium transition sm:flex-none " +
                (active ? "bg-brand-600 text-white shadow-md shadow-brand-600/25" : "text-ink-muted hover:bg-brand-50 hover:text-brand-700")
              }
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {search && (
        <p className="mt-4 text-sm text-ink-muted" role="status">
          Showing users matching &quot;{search}&quot;.
        </p>
      )}

      <UserTable initialUsers={users} page={page} search={search} />

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3 text-sm sm:justify-end">
          {page > 1 && (
            <Link href={usersPageHref(role, page - 1, search)} className={PAGER_LINK}>
              Previous
            </Link>
          )}
          <span className="text-ink-muted">Page {page}</span>
          {hasNext && (
            <Link href={usersPageHref(role, page + 1, search)} className={PAGER_LINK}>
              Next
            </Link>
          )}
        </nav>
      )}
    </AppShell>
  );
}

function UserTable({ initialUsers, page, search }: { initialUsers: SchoolUser[]; page: number; search: string }) {
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

  function actionsFor(row: SchoolUser, align?: "start" | "end") {
    if (!isManageable(row)) return null;
    return (
      <UserActions
        user={row}
        editingAnother={editing !== null}
        onEdit={() => {
          setNotice(null);
          setEditing(row);
        }}
        onChanged={changed}
        onNotice={setNotice}
        align={align}
      />
    );
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
            onSaved={(updated) => changed(updated, updated.name + " updated.")}
          />
        )}
      </div>

      {/* Below xl the table would not fit beside the sidebar, so each user is a card. */}
      <ul className="mt-4 space-y-3 xl:hidden">
        {users.map((row) => (
          <li
            key={row.id}
            className={
              "rounded-3xl border border-brand-100 p-4 shadow-sm transition hover:shadow-md sm:p-5 " +
              (row.is_active ? "bg-card" : "bg-surface/70")
            }
          >
            <div className="flex items-start gap-3">
              <Avatar user={row} />
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold text-navy-900">{row.name}</p>
                <p className="break-all text-sm text-ink-muted">{row.email}</p>
              </div>
              <StatusBadge active={row.is_active} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <RoleBadge role={row.role} />
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
                </svg>
                {row.phone}
              </span>
            </div>
            {isManageable(row) && <div className="mt-4 border-t border-line pt-3">{actionsFor(row, "start")}</div>}
          </li>
        ))}
        {users.length === 0 && <EmptyRows page={page} search={search} />}
      </ul>

      {/* relative: keeps the visually hidden "Actions" header inside the scroll box. */}
      <div className="relative mt-4 hidden overflow-x-auto rounded-3xl border border-brand-100 bg-card shadow-sm xl:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-brand-100 bg-brand-50/60 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <tr>
              <th scope="col" className="px-5 py-3.5">User</th>
              <th scope="col" className="px-5 py-3.5">Phone</th>
              <th scope="col" className="px-5 py-3.5">Role</th>
              <th scope="col" className="px-5 py-3.5">Status</th>
              <th scope="col" className="px-5 py-3.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr
                key={row.id}
                className={"border-b border-line transition last:border-0 hover:bg-brand-50/40 " + (row.is_active ? "" : "bg-surface/70")}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar user={row} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-900">{row.name}</p>
                      <p className="truncate text-ink-muted">{row.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-ink-muted">{row.phone}</td>
                <td className="px-5 py-3.5">
                  <RoleBadge role={row.role} />
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge active={row.is_active} />
                </td>
                <td className="px-5 py-3.5">{actionsFor(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <EmptyRows page={page} search={search} />}
      </div>
    </>
  );
}

function Avatar({ user }: { user: SchoolUser }) {
  return (
    <span
      aria-hidden="true"
      className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold " + (ROLE_AVATAR[user.role] ?? "")}
    >
      {initials(user.name)}
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-medium " + (ROLE_BADGE[role] ?? "")}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
        (active ? "bg-success-50 text-success-600" : "bg-danger-50 text-danger-600")
      }
    >
      <span aria-hidden="true" className={"h-1.5 w-1.5 rounded-full " + (active ? "bg-success-600" : "bg-danger-600")} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function EmptyRows({ page, search }: { page: number; search: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6" />
        </svg>
      </span>
      <p className="text-sm text-ink-muted">
        {page > 1 ? "No more users." : search ? "No users match this search." : "No users match this filter yet."}
      </p>
    </div>
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
