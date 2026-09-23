"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { OtpStep } from "@/components/auth/OtpStep";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { requestSignupCode } from "@/app/join/actions";
import { requestNewClub } from "./actions";

const MIN_PASSWORD_LENGTH = 10;

type Pending = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  club: Record<string, string>;
};

const CLUB_FIELDS = ["clubName", "description", "city", "meets", "memberCount", "message"];

/**
 * Bringing an existing club onto the portal.
 *
 * Works signed out, creating the account on the way through: the person
 * applying has no club here yet, so /join -- which asks which club you want to
 * join -- is not a door they can use.
 */
export function NewClubForm({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [awaiting, setAwaiting] = useState<Pending | null>(null);

  function clubFields(fd: FormData): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of CLUB_FIELDS) out[key] = String(fd.get(key) ?? "");
    return out;
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);

    if (!signedIn) {
      const details: Pending = {
        email: String(fd.get("email") ?? "").trim(),
        password: String(fd.get("password") ?? ""),
        firstName: String(fd.get("first_name") ?? "").trim(),
        lastName: String(fd.get("last_name") ?? "").trim(),
        club: clubFields(fd),
      };
      if (details.password.length < MIN_PASSWORD_LENGTH) {
        setError(`Please use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }

      startTransition(async () => {
        const code = await requestSignupCode({
          email: details.email,
          password: details.password,
          firstName: details.firstName,
          lastName: details.lastName,
        });
        if (!code.ok) {
          setError(code.error);
          return;
        }
        setAwaiting(details);
      });
      return;
    }

    startTransition(async () => {
      const result = await requestNewClub(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      router.refresh();
    });
  }

  async function verify(code: string): Promise<string | null> {
    if (!awaiting) return "Please start again.";

    const supabase = getBrowserSupabaseClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: awaiting.email,
      token: code,
      type: "signup",
    });
    if (verifyError) {
      return "That code is wrong or has expired. Check the code, or send yourself a new one.";
    }

    const fd = new FormData();
    for (const [key, value] of Object.entries(awaiting.club)) fd.set(key, value);
    const result = await requestNewClub(fd);
    if (!result.ok) return result.error;

    setAwaiting(null);
    setSent(true);
    router.refresh();
    return null;
  }

  if (awaiting) {
    return (
      <OtpStep
        email={awaiting.email}
        submitLabel="Confirm and apply"
        onVerify={verify}
        onResend={async () => {
          const code = await requestSignupCode({
            email: awaiting.email,
            password: awaiting.password,
            firstName: awaiting.firstName,
            lastName: awaiting.lastName,
          });
          return code.ok ? null : code.error;
        }}
        onBack={() => setAwaiting(null)}
        backLabel="Change my details"
      />
    );
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <Notice tone="success">
          Your application is with Pick a Book. We&apos;ll email you when it has
          been looked at.
        </Notice>
        <p className="text-sm text-ink-muted">
          Once it is approved your club is created straight away, private, with
          you as its admin — you decide when to open it for applications.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}

      <Field label="Club name" name="clubName" required maxLength={120} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Where it meets" name="city" maxLength={120} placeholder="Colombo" />
        <Field
          label="How often"
          name="meets"
          maxLength={200}
          placeholder="Last Saturday of the month"
        />
      </div>

      <Field
        label="How many members"
        name="memberCount"
        type="number"
        min={0}
        max={100000}
        hint="Roughly is fine."
      />

      <TextareaField
        label="About the club"
        name="description"
        rows={4}
        maxLength={2000}
        hint="What you read, and who comes."
      />

      {!signedIn ? (
        <>
          <hr className="border-line" />
          <p className="text-sm font-medium text-ink">About you</p>
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
            minLength={MIN_PASSWORD_LENGTH}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          />
        </>
      ) : null}

      <TextareaField
        label="Anything else"
        name="message"
        rows={3}
        maxLength={2000}
        hint="Optional."
      />

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? (signedIn ? "Sending…" : "Sending your code…") : "Apply"}
      </Button>
    </form>
  );
}
