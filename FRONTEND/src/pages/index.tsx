import Head from "next/head";
import Link from "next/link";

import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <>
      <Head>
        <title>Pikva</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-navy-900 px-6 text-center">
        <Logo tone="light" size={48} />
        <h1 className="max-w-md text-2xl font-semibold text-white">
          Secure School Pickup Management Platform
        </h1>
        <p className="max-w-sm text-white/75">
          Only authorised people. Every pickup verified. Fully traceable.
        </p>
        <Link
          href="/login"
          className="w-full max-w-xs rounded-lg bg-brand-600 px-5 py-3 font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Sign In
        </Link>
      </main>
    </>
  );
}
