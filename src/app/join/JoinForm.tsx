"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Field, Notice } from "@/components/ui/Field";

export type JoinableClub = {
  id: string;
  name: string;
  description: string | null;
};

const MIN_LENGTH = 10;

export function JoinForm({
  clubs,
  siteUrl,
}: {
  clubs: JoinableClub[];
  siteUrl: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const firstName = String(form.get("first_name") ?? "").trim();
    const lastName = String(form.get("last_name") ?? "").trim();
    const clubId = String(form.get("club_id") ?? "");

    if (password.length < MIN_LENGTH) {
      setError(`Please use a password of at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (!clubId) {
      setError("Please choose a club to join.");
      return;
    }

    setBusy(true);
    const supabase = getBrowserSupabaseClient();

    // Client-side signUp rather than a service-role createUser: this is what
    // makes Supabase send the confirmation email natively. Names go in
    // `data` purely as profile convenience -- nothing security-relevant is
    // ever read from user metadata (see handle_new_user).
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?next=/pending`,
        data: { first_name: firstName, last_name: lastName },
      },
    });

    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes("already")
          ? "There's already an account with that email. Try logging in instead."
          : "We couldn't create your account. Please check your details and try again.",
      );
      setBusy(false);
      return;
    }

    // No session means email confirmation is on: the club application has to
    // wait until they confirm and sign in, so tell them that plainly rather
    // than silently dropping their club choice.
    if (!data.session) {
      window.sessionStorage.setItem("pab:pending-club", clubId);
      setNeedsConfirm(true);
      setBusy(false);
      return;
    }

    await supabase
      .from("profiles")
      .update({ first_name: firstName, last_name: lastName })
      .eq("id", data.user!.id);

    const { error: joinError } = await supabase.rpc("request_club_join", {
      p_club_id: clubId,
    });

    if (joinError) {
      setError(joinError.message);
      setBusy(false);
      return;
    }

    router.replace("/pending");
    router.refresh();
  }

  if (needsConfirm) {
    return (
      <Notice tone="success">
        Check your email to confirm your address. Once you&apos;ve confirmed and
        logged in, your club application goes to the club admins for approval.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
          className="w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-600"
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

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Creating your account…" : "Apply to join"}
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
