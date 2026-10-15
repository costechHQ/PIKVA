import type { GetServerSideProps } from "next";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { ROLE_LABEL } from "@/lib/navigation";
import type { Role } from "@/lib/roles";
import {
  ROLE_FILTERS,
  type SchoolUser,
  USERS_PAGE_SIZE,
  parsePage,
  parseRoleFilter,
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

/** School users list for admins (SRS 6.7): filter by role, page by 50. */
export default function UsersPage({ user, users, role, page, hasNext }: Props) {
  return (
    <AppShell user={user} title="Users" subtitle={`Parents, gate staff and administrators at ${user.school_name}`}>
      <div className="mb-4 flex justify-end">
        <Link
          href={role === "parent" || role === "gate_staff" ? `/admin/users/new?role=${role}` : "/admin/users/new"}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs font-medium text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Name</th>
              <th scope="col" className="px-4 py-3 font-medium">Email</th>
              <th scope="col" className="px-4 py-3 font-medium">Phone</th>
              <th scope="col" className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-ink-muted">{row.email}</td>
                <td className="px-4 py-3 text-ink-muted">{row.phone}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${ROLE_BADGE[row.role] ?? ""}`}>
                    {ROLE_LABEL[row.role] ?? row.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            {page > 1 ? "No more users." : "No users match this filter yet."}
          </p>
        )}
      </div>

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-end gap-2 text-sm">
          {page > 1 && (
            <Link href={usersPageHref(role, page - 1)} className="rounded-lg border border-line bg-card px-3 py-1.5 hover:text-brand-700">
              Previous
            </Link>
          )}
          <span className="px-2 text-ink-muted">Page {page}</span>
          {hasNext && (
            <Link href={usersPageHref(role, page + 1)} className="rounded-lg border border-line bg-card px-3 py-1.5 hover:text-brand-700">
              Next
            </Link>
          )}
        </nav>
      )}
    </AppShell>
  );
}
