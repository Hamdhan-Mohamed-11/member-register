"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Field, Notice, selectClassName } from "@/components/ui/Field";
import { OtpStep } from "@/components/auth/OtpStep";
import { useHydrated } from "@/lib/useHydrated";
import { requestSignupCode } from "./actions";

export type JoinableClub = {
  id: string;
  name: string;
  description: string | null;
};

const MIN_LENGTH = 10;

type Pending = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  clubId: string;
};

/**
 * Two-step signup: details, then the code emailed to that address.
 *
 * The account is created by requestSignupCode on the server (unconfirmed), and
 * verifyOtp here is what confirms the address and returns the session. Only
 * then is the club application filed -- request_club_join runs under the
 * member's own session, so an address nobody verified can never end up in the
 * approval queue.
 *
 * The typed details stay in component state across the two steps rather than
 * in sessionStorage: the password is among them, and the flow never leaves
 * this page, so there is nothing to persist for.
 */
export function JoinForm({ clubs }: { clubs: JoinableClub[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const details: Pending = {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      firstName: String(form.get("first_name") ?? "").trim(),
      lastName: String(form.get("last_name") ?? "").trim(),
      clubId: String(form.get("club_id") ?? ""),
    };

    if (details.password.length < MIN_LENGTH) {
      setError(`Please use a password of at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (!details.clubId) {
      setError("Please choose a club to join.");
      return;
    }

    setBusy(true);
    const result = await requestSignupCode(details);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPending(details);
  }

  async function verify(code: string): Promise<string | null> {
    if (!pending) return "Please start again.";

    const supabase = getBrowserSupabaseClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: pending.email,
      token: code,
      type: "signup",
    });

    if (verifyError) {
      return "That code is wrong or has expired. Check the code, or send yourself a new one.";
    }

    // Confirmed and signed in. The club application is the last step, and it
    // is the only one that needs a session.
    const { error: joinError } = await supabase.rpc("request_club_join", {
      p_club_id: pending.clubId,
    });
    if (joinError) return joinError.message;

    router.replace("/pending");
    router.refresh();
    return null;
  }

  async function resend(): Promise<string | null> {
    if (!pending) return "Please start again.";
    const result = await requestSignupCode(pending);
    return result.ok ? null : result.error;
  }

  if (pending) {
    return (
      <OtpStep
        email={pending.email}
        submitLabel="Confirm and apply"
        onVerify={verify}
        onResend={resend}
        onBack={() => setPending(null)}
        backLabel="Change my details"
      />
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" name="first_name" autoComplete="given-name" required />
        <Field label="Last name" name="last_name" autoComplete="family-name" required />
      </div>

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        hint="We'll email you a one-time code to confirm this address."
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_LENGTH}
        hint={`At least ${MIN_LENGTH} characters.`}
      />

      <div>
        <label htmlFor="club_id" className="block text-sm font-medium text-ink mb-1.5">
          Which club would you like to join?
        </label>
        <select
          id="club_id"
          name="club_id"
          required
          defaultValue={clubs.length === 1 ? clubs[0].id : ""}
          className={selectClassName}
        >
          <option value="" disabled>
            Choose a club…
          </option>
          {clubs.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-muted">
          A club admin reviews your application. You can pay to join more clubs
          later.
        </p>
      </div>

      <Button type="submit" disabled={busy || !hydrated} className="w-full">
        {busy ? "Sending your code…" : "Send my code"}
      </Button>

      <p className="text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
