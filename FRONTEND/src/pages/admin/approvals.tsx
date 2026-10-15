import type { GetServerSideProps } from "next";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FormError } from "@/components/AuthCard";
import { EmptyState, LoadError, PupilAvatar, Skeleton, SuccessNote } from "@/components/ParentUi";
import { type ApprovalRequest, approveBody, pendingApprovals } from "@/lib/approvals";
import { type CurrentUser, getAsUser, requireUser } from "@/lib/auth-guard";
import { initials } from "@/lib/format";
import { type PickupPerson, type Pupil, formatDateTime, isWebPhoto, pupilName } from "@/lib/parent";
import { sendAsUser } from "@/lib/parent-api";
import { useNow } from "@/lib/use-now";

type Props = { user: CurrentUser; requests: ApprovalRequest[] | null };

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const guard = await requireUser(context, ["school_admin"]);
  if (!("props" in guard)) return guard;
  const { user } = await guard.props;

  // FastAPI limits both lists to the admin's own school.
  try {
    const [people, pupils] = await Promise.all([
      getAsUser<PickupPerson[]>(context, "pickers"),
      getAsUser<Pupil[]>(context, "pupils"),
    ]);
    return { props: { user, requests: pendingApprovals(people, pupils) } };
  } catch {
    return { props: { user, requests: null } };
  }
};

/** Pickup people that parents added or changed, waiting for the school's approval (SRS 9.2). */
export default function ApprovalsPage({ user, requests }: Props) {
  return (
    <AppShell
      user={user}
      title="Approvals"
      subtitle="Pickup people added or changed by parents. They cannot collect until you approve them."
    >
      {requests ? <ApprovalList initial={requests} /> : <LoadError message="We couldn't load the approval requests." />}
    </AppShell>
  );
}

function ApprovalList({ initial }: { initial: ApprovalRequest[] }) {
  const [requests, setRequests] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);

  function handled(id: number, message: string) {
    setRequests((current) => current.filter((request) => request.person.id !== id));
    setNotice(message);
  }

  return (
    <div className="space-y-6">
      <SuccessNote message={notice} />
      {requests.length === 0 ? (
        <EmptyState title="Nothing waiting for approval.">
          When a parent adds a pickup person or changes one, they appear here.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {requests.map((request) => (
            <li key={request.person.id}>
              <RequestCard request={request} onHandled={handled} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestCard({
  request: { person, pupil },
  onHandled,
}: {
  request: ApprovalRequest;
  onHandled: (id: number, message: string) => void;
}) {
  // Dates use the viewer's time zone, so they wait for the browser.
  const now = useNow();
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pupilText = pupil ? pupilName(pupil) : "this pupil";

  async function approve() {
    setBusy("approve");
    setError(null);
    const result = await sendAsUser<PickupPerson>(
      `pickers/${person.id}/approve`,
      "POST",
      approveBody(person),
      "This pickup person no longer exists.",
    );
    setBusy(null);

    if (result.ok) onHandled(person.id, `${person.picker_name} approved. They can now collect ${pupilText}.`);
    else setError(result.message);
  }

  // Refusing is deactivating (SRS 9.2); the parent sees them as inactive.
  async function decline() {
    setBusy("decline");
    setError(null);
    const result = await sendAsUser<PickupPerson>(
      `pickers/${person.id}/deactivate`,
      "POST",
      undefined,
      "This pickup person no longer exists.",
    );
    setBusy(null);
    setConfirmingDecline(false);

    if (result.ok) onHandled(person.id, `${person.picker_name} declined and deactivated.`);
    else setError(result.message);
  }

  return (
    <article className="h-full rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <PickerPhoto person={person} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{person.picker_name}</h2>
          <p className="truncate text-sm text-ink-muted">
            {person.relationship} · {person.type}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-surface p-3">
        <div className="flex items-center gap-2">
          {pupil && <PupilAvatar pupil={pupil} size="sm" />}
          <p className="min-w-0 truncate text-sm">
            Would collect <span className="font-medium">{pupilText}</span>
          </p>
        </div>
        {pupil && (
          <div className="mt-2 text-sm">
            <p className="truncate">
              <span className="text-ink-muted">Sent by </span>
              <span className="font-medium">{pupil.parent.name}</span>
            </p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
              <a href={`tel:${pupil.parent.phone}`} className="font-medium text-brand-600 hover:text-brand-700">
                {pupil.parent.phone}
              </a>
              <a href={`mailto:${pupil.parent.email}`} className="min-w-0 truncate font-medium text-brand-600 hover:text-brand-700">
                {pupil.parent.email}
              </a>
            </p>
          </div>
        )}
      </div>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-ink-muted">Phone</dt>
          <dd className="min-w-0 truncate">
            <a href={`tel:${person.picker_phone}`} className="font-medium text-brand-600 hover:text-brand-700">
              {person.picker_phone}
            </a>
          </dd>
        </div>
        {(
          [
            ["From", person.starts_at],
            ["Until", person.expires_at],
            ["Sent", person.updated_at],
          ] as const
        ).map(([label, iso]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-muted">{label}</dt>
            <dd>{now ? formatDateTime(iso) : <Skeleton className="mt-1 h-3 w-28" />}</dd>
          </div>
        ))}
      </dl>

      {error && (
        <div className="mt-4 space-y-2">
          <FormError message={error} />
          <p className="text-xs text-ink-muted">If the details changed, reload the page to review them again.</p>
        </div>
      )}

      {confirmingDecline ? (
        <div className="mt-4 rounded-xl bg-danger-50 p-3">
          <p className="text-sm">
            Decline {person.picker_name}? They will be deactivated and cannot collect {pupilText}. The parent can ask
            again by activating them.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void decline()}
              disabled={busy !== null}
              className="rounded-lg bg-danger-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy === "decline" ? "Declining…" : "Decline"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDecline(false)}
              disabled={busy !== null}
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void approve()}
            disabled={busy !== null}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDecline(true)}
            disabled={busy !== null}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-danger-600 hover:border-danger-600"
          >
            Decline
          </button>
        </div>
      )}
    </article>
  );
}

/** The pickup person's photo, which helps the admin judge the request, or their initials. */
function PickerPhoto({ person }: { person: PickupPerson }) {
  if (isWebPhoto(person.photo_url)) {
    return (
      // Photo URLs point at any host the school uses, so next/image is not used.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={person.photo_url} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
    >
      {initials(person.picker_name)}
    </span>
  );
}
