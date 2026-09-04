"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { Button } from "@/components/ui/Button";
import { Field, Notice } from "@/components/ui/Field";
import { useHydrated } from "@/lib/useHydrated";

const MIN_LENGTH = 10;
const MAX_NAME = 80;

/**
 * Invite acceptance: name AND password, in one step.
 *
 * Password alone is not enough here. A self-signup passes its name through
 * auth.signUp metadata and handle_new_user copies it into the profile, but an
 * invited user is created by generateLink with no metadata at all -- so the
 * profile lands with empty names and the person shows up across the directory,
 * the attendance recorder and the admin lists as an avatar placeholder with no
 * name beside it. Nothing later in the flow ever asks, so it stayed that way.
 *
 * The name is written under the member's own session, which RLS already allows
 * for one's own row -- the same path /me/edit uses.
 */
export function AcceptInviteForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (!firstName) {
      setError("Please tell us your first name.");
      return;
    }
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

    const { data: userData, error: updateError } = await supabase.auth.updateUser({
      password,
      data: { first_name: firstName, last_name: lastName },
    });

    if (updateError || !userData?.user) {
      setError(
        "We couldn't finish setting up your account. Try again — and if it still fails, your invite link has probably expired, so ask for a new one.",
      );
      setBusy(false);
      return;
    }

    // The profile row already exists (handle_new_user made it when the invite
    // was issued), so this is an update, not an insert. Metadata alone would
    // not do it: nothing copies metadata to the profile after creation.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.slice(0, MAX_NAME),
        last_name: lastName.slice(0, MAX_NAME),
      })
      .eq("id", userData.user.id);

    if (profileError) {
      // The password IS set at this point, so do not send them back to the
      // start -- they can fix a name later, and being unable to log in would
      // be far worse.
      setError(
        "Your password is set, but we couldn't save your name. Please sign in and add it under Me.",
      );
      setBusy(false);
      return;
    }

    router.replace("/feed");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          maxLength={MAX_NAME}
        />
        <Field
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          maxLength={MAX_NAME}
        />
      </div>

      <Field
        label="Password"
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
        {busy ? "Setting up…" : "Set up my account"}
      </Button>

      <p className="text-xs text-ink-faint">
        You can add a photo afterwards from your profile.
      </p>
    </form>
  );
}
