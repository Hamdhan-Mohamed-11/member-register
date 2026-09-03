"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Field, Notice } from "@/components/ui/Field";
import { useHydrated } from "@/lib/useHydrated";

const MIN_LENGTH = 10;

/**
 * Shared by invite acceptance and password recovery -- both land the user in a
 * session established by /auth/callback, and both then just need
 * auth.updateUser({ password }).
 */
export function SetPasswordForm({
  submitLabel,
  redirectTo,
}: {
  submitLabel: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < MIN_LENGTH) {
      setError(`Please use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setBusy(true);
    const supabase = getBrowserSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      // An expired code is the common cause, but a slow or dropped connection
      // lands here too, and blaming the code for that sends people off to
      // request another one when retrying would have worked. Say both.
      setError(
        "We couldn't set your password. Try again — and if it still fails, your code has probably expired, so request a new one.",
      );
      setBusy(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}

      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_LENGTH}
        hint={`At least ${MIN_LENGTH} characters.`}
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
      />

      <Button type="submit" disabled={busy || !hydrated} className="w-full">
        {busy ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
