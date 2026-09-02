"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { OtpStep } from "@/components/auth/OtpStep";
import { useHydrated } from "@/lib/useHydrated";
import { requestPasswordResetCode } from "./actions";

/**
 * Password recovery by emailed code rather than emailed link.
 *
 * The link version never worked in production -- GoTrue's `recovery` mail was
 * the one template that would not deliver over the club's SMTP, which left
 * anyone who forgot a password with no way back in. Codes are minted the same
 * way but sent by this app's own mailer, so recovery now uses the same path as
 * every other email we send.
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    const typed = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    await requestPasswordResetCode(typed);

    // Move on regardless of what happened server-side. The action reports
    // nothing back for a reason: whether that address has an account is not
    // something this form may reveal.
    setEmail(typed);
    setBusy(false);
  }

  async function verify(code: string): Promise<string | null> {
    if (!email) return "Please start again.";

    const supabase = getBrowserSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "recovery",
    });

    if (error) {
      // Also what an unregistered address gets, since no code was ever sent
      // for it -- deliberately the same message.
      return "That code is wrong or has expired. Check the code, or send yourself a new one.";
    }

    // Verified: there is now a recovery session, which is exactly what
    // /auth/reset-password needs to accept a new password.
    router.replace("/auth/reset-password");
    router.refresh();
    return null;
  }

  async function resend(): Promise<string | null> {
    if (!email) return "Please start again.";
    await requestPasswordResetCode(email);
    return null;
  }

  if (email) {
    return (
      <div className="space-y-4">
        <OtpStep
          email={email}
          submitLabel="Check code"
          onVerify={verify}
          onResend={resend}
          onBack={() => setEmail(null)}
        />
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
        hint="If that address has an account, we'll email you a one-time code."
      />
      <Button type="submit" disabled={busy || !hydrated} className="w-full">
        {busy ? "Sending…" : "Send reset code"}
      </Button>
      <Link href="/login" className="block text-sm text-brand-600 hover:underline">
        Back to log in
      </Link>
    </form>
  );
}
