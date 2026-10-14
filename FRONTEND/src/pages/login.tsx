import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type FormEvent, useState } from "react";

import { Logo } from "@/components/Logo";
import { loginErrorMessage } from "@/lib/login-error";
import { HOME_PATH, type Role } from "@/lib/roles";

/**
 * Sign-in page (SRS 18.2). Posts to the BFF route /api/auth/login, which
 * stores the JWT in an httpOnly cookie; this page never sees the token.
 * Then asks /api/auth/me for the role and goes to that role's home page.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(loginErrorMessage(response.status, body, response.headers.get("Retry-After")));
        return;
      }

      const me = await fetch("/api/auth/me");
      const user: { role?: Role } | null = me.ok ? await me.json() : null;
      const home = user?.role ? HOME_PATH[user.role] : undefined;

      if (!home) {
        setError("Signed in, but your account could not be loaded. Please try again.");
        return;
      }

      await router.replace(home);
    } catch {
      setError("Could not reach Pikva. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Sign in · Pikva</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card px-6 py-10 shadow-sm sm:px-8">
          <div className="flex justify-center">
            <Logo size={40} />
          </div>
          <h1 className="mt-8 text-center text-2xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-center text-sm text-ink-muted">Sign in to your school account</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium">
                  Password
                </label>
                <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                  Forgot password?
                </Link>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-2.5 pl-3 pr-16 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-muted hover:text-ink"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="w-full rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
