"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Field, Notice } from "@/components/ui/Field";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const supabase = getBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Deliberately not distinguishing "no such user" from "wrong password" --
      // that difference is an account-enumeration oracle.
      setError("That email and password don't match. Please try again.");
      setBusy(false);
      return;
    }

    // `next` comes from the proxy redirect. Only accept same-origin relative
    // paths: an open redirect here would let a phishing link bounce a
    // freshly-authenticated user off-site.
    const next = searchParams.get("next");
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/feed";

    router.replace(target);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Log in"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-brand-600 hover:underline">
          Forgot password?
        </Link>
        <Link href="/join" className="text-brand-600 hover:underline">
          Join a club
        </Link>
      </div>
    </form>
  );
}
