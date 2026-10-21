import type { GetServerSideProps } from "next";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { LoadError, Skeleton } from "@/components/ParentUi";
import {
  ACTION_LABELS,
  AUDIT_PAGE_SIZE,
  type AuditRecord,
  actionLabel,
  auditApiPath,
  auditHref,
  auditLinks,
  auditNotes,
  parseActionFilter,
} from "@/lib/audit";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { type PickupPerson, type Pupil, formatDateTime, pupilName } from "@/lib/parent";
import { useNow } from "@/lib/use-now";
import { parsePage } from "@/lib/users";

type Names = { pupils: Record<number, string>; people: Record<number, string> };

type Data = { records: AuditRecord[]; names: Names; action: string | null; page: number; hasNext: boolean };

type Props = { user: CurrentUser; data: Data | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;
  const action = parseActionFilter(context.query.action);
  const page = parsePage(context.query.page);

  // FastAPI limits every list to the admin's own school.
  try {
    const [rows, pupils, people] = await Promise.all([
      getAsUser<AuditRecord[]>(context, auditApiPath(action, page)),
      getAsUser<Pupil[]>(context, "pupils"),
      getAsUser<PickupPerson[]>(context, "pickers"),
    ]);
    const names: Names = {
      pupils: Object.fromEntries(pupils.map((pupil) => [pupil.id, pupilName(pupil)])),
      people: Object.fromEntries(people.map((person) => [person.id, person.picker_name])),
    };
    return {
      props: {
        user,
        data: { records: rows.slice(0, AUDIT_PAGE_SIZE), names, action, page, hasNext: rows.length > AUDIT_PAGE_SIZE },
      },
    };
  } catch {
    return { props: { user, data: null } };
  }
};

/** The school's audit log for admins (SRS 14): who did what, and when. Read-only. */
export default function AuditLogPage({ user, data }: Props) {
  return (
    <AppShell user={user} title="Audit Log" subtitle="Who did what at your school, newest first. Records cannot be changed.">
      {data ? <AuditList data={data} /> : <LoadError message="We couldn't load the audit log." />}
    </AppShell>
  );
}

function AuditList({ data }: { data: Data }) {
  const { records, names, action, page, hasNext } = data;

  return (
    <div className="space-y-6">
      {/* Links, not a form: the filter works before scripts load. */}
      <details className="group rounded-2xl border border-brand-100 bg-card shadow-sm transition open:shadow-md">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl py-3 pe-4 ps-4 outline-none marker:content-none focus-visible:ring-4 focus-visible:ring-brand-100 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-transform group-open:rotate-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">Action</span>
            <span className="block truncate font-semibold text-navy-900">{action ? actionLabel(action) : "All actions"}</span>
          </span>
        </summary>
        <ul aria-label="Filter by action" className="max-h-72 space-y-1 overflow-y-auto border-t border-line p-2">
          {[{ value: "", label: "All actions" }, ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))].map((option) => {
            const active = (action ?? "") === option.value;
            return (
              <li key={option.value || "all"}>
                <Link
                  href={auditHref(option.value || null, 1)}
                  aria-current={active ? "true" : undefined}
                  className={
                    "flex items-center justify-between rounded-xl px-3 py-2 text-sm transition " +
                    (active ? "bg-brand-600 font-semibold text-white" : "text-navy-900 hover:bg-brand-50 hover:text-brand-700")
                  }
                >
                  {option.label}
                  {active && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </details>

      <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-card">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-brand-100 bg-brand-50 text-xs font-semibold text-navy-900">
            <tr>
              <th scope="col" className="w-40 px-4 py-3 font-medium">When</th>
              <th scope="col" className="px-4 py-3 font-medium">Who</th>
              <th scope="col" className="px-4 py-3 font-medium">What</th>
              <th scope="col" className="px-4 py-3 font-medium">About</th>
              <th scope="col" className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <AuditRow key={record.id} record={record} names={names} />
            ))}
          </tbody>
        </table>
        {records.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            {page > 1 ? "No more records." : "No records for this action yet."}
          </p>
        )}
      </div>

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm sm:justify-end">
          {page > 1 ? (
            <Link href={auditHref(action, page - 1)} className="rounded-full border border-brand-100 bg-card px-4 py-2 font-medium hover:text-brand-700">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="px-2 text-ink-muted">Page {page}</span>
          {hasNext ? (
            <Link href={auditHref(action, page + 1)} className="rounded-full border border-brand-100 bg-card px-4 py-2 font-medium hover:text-brand-700">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function AuditRow({ record, names }: { record: AuditRecord; names: Names }) {
  // Times use the viewer's time zone, so they wait for the browser.
  const now = useNow();
  const { pupilId, authorisationId } = auditLinks(record);
  const notes = auditNotes(record.metadata);

  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-4 py-3 text-ink-muted">
        {now ? <time dateTime={record.created_at}>{formatDateTime(record.created_at)}</time> : <Skeleton className="h-3 w-24" />}
      </td>
      <td className="px-4 py-3 font-medium">{record.user?.name ?? <span className="text-ink-muted">System</span>}</td>
      <td className="px-4 py-3">{actionLabel(record.action)}</td>
      <td className="px-4 py-3">
        {pupilId !== null && (
          <Link href={`/admin/pupils/${pupilId}`} className="block font-medium text-brand-600 hover:text-brand-700">
            {names.pupils[pupilId] ?? `Pupil #${pupilId}`}
          </Link>
        )}
        {authorisationId !== null && (
          <span className="block text-ink-muted">{names.people[authorisationId] ?? `Pickup person #${authorisationId}`}</span>
        )}
        {pupilId === null && authorisationId === null && record.entity_id !== null && (
          <span className="text-ink-muted">
            {record.entity_type.replaceAll("_", " ")} #{record.entity_id}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-ink-muted">{notes.length > 0 ? notes.join(" · ") : "—"}</td>
    </tr>
  );
}
