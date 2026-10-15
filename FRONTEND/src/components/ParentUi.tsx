/**
 * Small building blocks shared by parent portal pages (SRS 18.9): load
 * error, empty state, skeleton and pupil avatar.
 */
import { useRouter } from "next/router";
import { type ReactNode, useState } from "react";

import { initials } from "@/lib/format";
import { type AuthorisationStatus, type Pupil, isWebPhoto, pupilName } from "@/lib/parent";

/** Shown when a page's data could not be loaded; "Try again" reloads it. */
export function LoadError({ message }: { message: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  function retry() {
    setRetrying(true);
    void router.replace(router.asPath).finally(() => setRetrying(false));
  }

  return (
    <div role="alert" className="rounded-2xl border border-danger-600/20 bg-danger-50 p-6 text-center">
      <p className="font-medium text-danger-600">{message}</p>
      <p className="mt-1 text-sm text-ink-muted">Check your connection, then try again.</p>
      <button
        type="button"
        onClick={retry}
        disabled={retrying}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {retrying ? "Trying again…" : "Try again"}
      </button>
    </div>
  );
}

/** A friendly message for a list with nothing in it. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 text-sm text-ink-muted">{children}</p>}
    </div>
  );
}

/** A grey placeholder bar while something is still being worked out. */
export function Skeleton({ className = "h-4 w-24" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-line ${className}`} />;
}

/** The pupil's photo, or their initials when there is none. */
export function PupilAvatar({ pupil, size = "md" }: { pupil: Pick<Pupil, "first_name" | "last_name" | "photo_url">; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-9 text-xs" : "h-12 w-12 text-sm";

  if (isWebPhoto(pupil.photo_url)) {
    return (
      // Photo URLs point at any host the school uses, so next/image is not used.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={pupil.photo_url} alt="" referrerPolicy="no-referrer" className={`${box} shrink-0 rounded-full object-cover`} />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-accent-50 font-semibold text-accent-600`}
    >
      {initials(pupilName(pupil))}
    </span>
  );
}

const STATUS_STYLE: Record<AuthorisationStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success-50 text-success-600" },
  scheduled: { label: "Scheduled", className: "bg-brand-50 text-brand-700" },
  expired: { label: "Expired", className: "bg-surface text-ink-muted" },
  inactive: { label: "Inactive", className: "bg-danger-50 text-danger-600" },
};

/** A pickup person's status as the backend works it out (SRS 9.1). */
export function StatusBadge({ status }: { status: AuthorisationStatus }) {
  const { label, className } = STATUS_STYLE[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
