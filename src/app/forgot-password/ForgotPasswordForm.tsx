"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Field, Notice } from "@/components/ui/Field";
import { useHydrated } from "@/lib/useHydrated";

export function ForgotPasswordForm({ siteUrl }: { siteUrl: string }) {
  const [sent, setSent] = useState(false);
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    const supabase = getBrowserSupabaseClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password`,
    });

    // Always report success, even when the address is unknown or the call
    // failed. Telling the visitor whether an address exists turns this form
    // into an account-enumeration oracle.
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          If that email is registered, a reset link is on its way. It expires
          after an hour.
        </Notice>
        <Link href="/login" className="block text-sm text-brand-600 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <Button type="submit" disabled={busy || !hydrated} className="w-full">
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className="block text-sm text-brand-600 hover:underline">
        Back to log in
      </Link>
    </form>
  );
}
