import type { GetServerSideProps } from "next";

import { HOME_PATH } from "@/lib/roles";

/**
 * Old parent landing page. Parents now have the web portal (SRS 18.9), so
 * old links and bookmarks go there; /parent does the sign-in and role check.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: HOME_PATH.parent, permanent: false },
});

export default function UseMobileAppPage() {
  return null;
}
