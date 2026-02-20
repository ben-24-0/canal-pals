"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password. Please try again.");
    } else {
      // Successful login — always go to /app
      router.push("/app");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-8 py-10 bg-card border border-border rounded-2xl shadow-xl">
        {/* Logo / Title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            Irrigation Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to access your dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="email"
              className="text-sm font-medium text-foreground"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@canal.io"
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <span>Demo — </span>
          <button
            type="button"
            onClick={() => {
              setEmail("admin@canal.io");
              setPassword("admin123");
            }}
            className="underline hover:text-foreground"
          >
            Admin
          </button>
          <span> / </span>
          <button
            type="button"
            onClick={() => {
              setEmail("user@canal.io");
              setPassword("user123");
            }}
            className="underline hover:text-foreground"
          >
            User
          </button>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
