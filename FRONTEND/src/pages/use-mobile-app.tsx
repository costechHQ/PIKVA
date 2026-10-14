import type { GetServerSideProps } from "next";
import { useState } from "react";

import { AuthCard, primaryButtonClass } from "@/components/AuthCard";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";
import { signOut } from "@/lib/sign-out";

type Props = { user: CurrentUser };

export const getServerSideProps: GetServerSideProps<Props> = (context) => requireUser(context, ["parent"]);

/**
 * Where a parent lands after signing in on the web (SRS 18.2): the web app
 * is for school staff, so parents get this message and Sign out only.
 */
export default function UseMobileAppPage({ user }: Props) {
  const [signingOut, setSigningOut] = useState(false);

  function handleSignOut() {
    setSigningOut(true);
    void signOut();
  }

  return (
    <AuthCard pageTitle="Use the mobile app" title="Use the Pikva mobile app" subtitle={`Signed in as ${user.name}`}>
      <p className="text-center text-sm text-ink-muted">
        The Pikva website is for school staff. As a parent, use the Pikva mobile app to see your pupils, manage the
        people allowed to collect them and show your daily pickup code.
      </p>
      <button type="button" onClick={handleSignOut} disabled={signingOut} className={`mt-8 ${primaryButtonClass}`}>
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </AuthCard>
  );
}
