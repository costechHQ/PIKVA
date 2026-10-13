import Head from "next/head";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Head>
        <title>Pikva</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Pikva</h1>
        <p className="max-w-md text-lg text-zinc-600">
          Secure school pickup verification.
        </p>
        <Link
          href="/login"
          className="rounded-md bg-zinc-900 px-5 py-3 font-medium text-white hover:bg-zinc-700"
        >
          Sign in
        </Link>
      </main>
    </>
  );
}
