import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";

// Built per request, so the page carries this view's CSP nonce (src/proxy.ts).
export const getServerSideProps: GetServerSideProps = async () => ({ props: {} });

const FEATURES: { title: string; text: string; tone: string; icon: ReactNode }[] = [
  {
    title: "Only authorised people",
    text: "Parents approve exactly who may collect their child, with a photo so the gate knows the face.",
    tone: "bg-grape-100 text-grape-600",
    icon: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-1a6 6 0 0 1 9-5.2M15 18l2 2 4-4" />,
  },
  {
    title: "Scan and verify",
    text: "Gate staff scan a QR code or type the daily code. The answer comes back in a second.",
    tone: "bg-sun-100 text-sun-500",
    icon: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h2v2H8zM14 9h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z" />,
  },
  {
    title: "Every pickup traceable",
    text: "A clear history of who collected whom and when, plus instant alerts for anything suspicious.",
    tone: "bg-coral-400/20 text-coral-400",
    icon: <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  },
];

const STEPS: { n: string; title: string; text: string }[] = [
  { n: "1", title: "Register pupils", text: "The school adds pupils and links each one to their parents." },
  { n: "2", title: "Authorise pickers", text: "Parents add the people allowed to collect, and the school approves them." },
  { n: "3", title: "Verify at the gate", text: "Staff scan the code, see the photo, and release the child safely." },
];

function Squiggle({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 120 40" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 30c10-22 20-22 28-8s18 14 28-6 20-18 28-2 16 14 28-4"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Wave({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className={`block h-12 w-full sm:h-20 ${className}`} aria-hidden="true">
      <path d="M0 60c120 50 240 50 360 20s240-70 360-50 240 70 360 60 240-60 360-30v60H0Z" fill="currentColor" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <Head>
        <title>Pikva</title>
        <meta
          name="description"
          content="Secure school pickup management. Only authorised people, every pickup verified, fully traceable."
        />
      </Head>

      <header className="sticky top-0 z-30 border-b border-grape-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" aria-label="Pikva home" className="shrink-0">
            <img
              src="/images/pikva-logo.png"
              alt="Pikva"
              width={750}
              height={341}
              className="h-8 w-auto sm:h-10"
            />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-6 text-sm font-medium text-grape-900">
            <a href="#features" className="hidden hover:text-grape-600 sm:inline">Features</a>
            <a href="#how" className="hidden hover:text-grape-600 sm:inline">How it works</a>
            <Link
              href="/login"
              className="rounded-full bg-grape-600 px-5 py-2 text-white shadow-md shadow-grape-600/30 transition hover:-translate-y-0.5 hover:bg-grape-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grape-600"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="overflow-x-hidden bg-white">
        {/* Hero */}
        <section className="relative bg-gradient-to-b from-grape-50 to-white">
          <div className="pointer-events-none absolute -left-16 top-24 h-40 w-40 rounded-full bg-sun-400/40 blur-2xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-grape-400/20 blur-3xl" />
          <Squiggle className="motion-safe-anim absolute left-6 top-10 hidden h-8 w-24 animate-wiggle text-sun-400 md:block" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-2 md:pt-20">
            <div className="motion-safe-anim animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full bg-sun-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-grape-900">
                <span className="h-2 w-2 rounded-full bg-mint-400" />
                Safe today. Secure tomorrow.
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-grape-900 sm:text-5xl lg:text-6xl">
                Send every child home with{" "}
                <span className="relative whitespace-nowrap text-grape-600">
                  the right person
                  <Squiggle className="absolute -bottom-3 left-0 h-3 w-full text-sun-400" />
                </span>
                .
              </h1>
              <p className="mt-6 max-w-lg text-lg text-ink-muted">
                Pikva helps schools check every pickup. Only authorised people collect, every handover is verified, and
                nothing goes unrecorded.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="rounded-full bg-grape-600 px-7 py-3.5 font-semibold text-white shadow-lg shadow-grape-600/30 transition hover:-translate-y-0.5 hover:bg-grape-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grape-600"
                >
                  Sign in
                </Link>
                <a
                  href="#how"
                  className="rounded-full bg-sun-400 px-7 py-3.5 font-semibold text-grape-900 shadow-lg shadow-sun-400/40 transition hover:-translate-y-0.5 hover:bg-sun-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grape-600"
                >
                  See how it works
                </a>
              </div>
            </div>

            {/* Photo with an illustrative verification card on top */}
            <div className="relative mx-auto w-full max-w-md md:max-w-none">
              <div className="absolute -bottom-4 -right-4 h-full w-full rounded-[2.5rem] bg-sun-400" />
              <img
                src="/images/hero-children.jpg"
                alt="Three smiling Nigerian schoolgirls in blue uniforms reading a book together in a library"
                width={1080}
                height={720}
                className="relative aspect-[4/3] w-full rounded-[2.5rem] object-cover shadow-xl shadow-grape-600/20"
              />
              <div className="motion-safe-anim absolute -bottom-8 -left-3 w-60 animate-float rounded-3xl border border-grape-100 bg-white p-4 shadow-2xl shadow-grape-600/25 sm:-left-8 sm:w-64">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint-400/20 text-success-600">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-bold text-grape-900">Verification successful</p>
                    <p className="text-xs text-ink-muted">Authorised for pickup</p>
                  </div>
                </div>
              </div>
              <div className="motion-safe-anim absolute -top-5 left-6 animate-float-slow rounded-2xl bg-white px-4 py-2 text-sm font-bold text-grape-600 shadow-lg ring-1 ring-grape-100 sm:left-10">
                Photo match
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-grape-500">What Pikva does</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-center text-3xl font-extrabold text-grape-900 sm:text-4xl">
            Calm, clear pickup for schools and parents
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-3xl border border-grape-100 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-grape-600/10"
              >
                <span className={`flex h-14 w-14 items-center justify-center rounded-2xl transition group-hover:rotate-6 ${f.tone}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
                    {f.icon}
                  </svg>
                </span>
                <h3 className="mt-5 text-xl font-bold text-grape-900">{f.title}</h3>
                <p className="mt-2 text-ink-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Peace of mind */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 md:grid-cols-2">
          <div className="relative mx-auto w-full max-w-xs">
            <div className="absolute -left-4 top-6 h-full w-full rounded-t-full bg-grape-100" />
            <img
              src="/images/school-girl.jpg"
              alt="A smiling schoolgirl in a blue hijab holding a science textbook in her classroom"
              width={720}
              height={960}
              className="relative aspect-[3/4] w-full rounded-t-full rounded-b-3xl object-cover shadow-xl shadow-grape-600/20"
            />
            <div className="motion-safe-anim absolute -right-4 bottom-10 animate-float-slow rounded-2xl bg-sun-400 px-4 py-2 text-sm font-bold text-grape-900 shadow-lg sm:-right-10">
              Home safe
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-grape-500">For parents</p>
            <h2 className="mt-3 text-3xl font-extrabold text-grape-900 sm:text-4xl">Peace of mind, one pickup at a time</h2>
            <p className="mt-4 text-lg text-ink-muted">
              You decide who may collect your child. The school checks every handover, and you can see it all in one place.
            </p>
            <ul className="mt-6 space-y-4">
              {[
                "Add and manage the people allowed to collect",
                "See every pickup in your child's history",
                "The school is alerted when something looks wrong",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 font-medium text-grape-900">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-grape-600 text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="relative bg-sun-400">
          <Wave className="-mb-px rotate-180 text-white" />
          <div className="mx-auto max-w-6xl px-5 pb-12 pt-6">
            <p className="text-center text-sm font-semibold uppercase tracking-wider text-grape-900/70">How it works</p>
            <h2 className="mx-auto mt-3 max-w-2xl text-center text-3xl font-extrabold text-grape-900 sm:text-4xl">
              Three steps to a safer school run
            </h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="rounded-3xl bg-white p-7 shadow-lg shadow-grape-900/10 transition duration-300 hover:-translate-y-2">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-grape-600 text-xl font-extrabold text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-grape-900">{s.title}</h3>
                  <p className="mt-2 text-ink-muted">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
          <Wave className="text-white" />
        </section>

        {/* Call to action */}
        <section className="px-5 pb-20 pt-6">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-grape-600 to-grape-900 px-6 py-14 text-center sm:px-12">
            <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-sun-400/30 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-coral-400/30 blur-2xl" />
            <h2 className="relative text-3xl font-extrabold text-white sm:text-4xl">Ready for stress-free pickup?</h2>
            <p className="relative mx-auto mt-4 max-w-md text-grape-100">
              Sign in to your school account to manage pupils, authorisations and the gate.
            </p>
            <Link
              href="/login"
              className="relative mt-8 inline-block rounded-full bg-sun-400 px-8 py-3.5 font-semibold text-grape-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-sun-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Sign in to Pikva
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-grape-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-sm text-ink-muted sm:flex-row">
          <img
            src="/images/pikva-logo-full.png"
            alt="Pikva, secure school pickup"
            width={759}
            height={342}
            className="h-14 w-auto sm:h-16"
          />
          <p className="text-center sm:text-right">Only authorised people. Every pickup verified. Fully traceable.</p>
        </div>
      </footer>
    </>
  );
}
