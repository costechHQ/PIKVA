import Link from "next/link";
import { useRouter } from "next/router";
import { type FormEvent, useState } from "react";

import { AuthCard, FormError, authInputClass, linkClass, primaryButtonClass } from "@/components/AuthCard";
import { OFFLINE } from "@/lib/api-errors";
import { redirectIfSignedIn } from "@/lib/auth-guard";
import { loginErrorMessage } from "@/lib/login-error";
import { HOME_PATH, type Role } from "@/lib/roles";

// Already signed in: go straight to your home page instead of the form.
export const getServerSideProps = redirectIfSignedIn;

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
      setError(OFFLINE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard pageTitle="Sign in" title="Welcome back" subtitle="Sign in to your school account">
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
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
            className={`mt-1.5 ${authInputClass}`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <Link href="/forgot-password" className={linkClass}>
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
              className={`${authInputClass} pr-16`}
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

        <FormError message={error} />

        <button type="submit" disabled={submitting || !email.trim() || !password} className={primaryButtonClass}>
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </AuthCard>
  );
}
