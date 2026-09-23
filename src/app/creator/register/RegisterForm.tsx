"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { OtpStep } from "@/components/auth/OtpStep";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { requestSignupCode } from "@/app/join/actions";
import { registerCreator } from "../actions";

const MIN_PASSWORD_LENGTH = 10;

type Pending = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  fields: { kind: "author" | "publisher"; name: string; about: string; website: string };
};

/**
 * Registering as an author or a publisher.
 *
 * The kind is a choice of two cards rather than a select, because it decides
 * what the rest of the portal is -- a publisher gets a list of authors under
 * it, an author gets only their own name -- and that is worth more than one
 * line of a dropdown.
 */
export function RegisterForm({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<"author" | "publisher">("author");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [awaiting, setAwaiting] = useState<Pending | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    fd.set("kind", kind);

    // Signed out, the account has to exist before it can be made a creator.
    // The details are held here across the code step rather than in storage:
    // one of them is a password, and the flow never leaves this page.
    if (!signedIn) {
      const details: Pending = {
        email: String(fd.get("email") ?? "").trim(),
        password: String(fd.get("password") ?? ""),
        firstName: String(fd.get("first_name") ?? "").trim(),
        lastName: String(fd.get("last_name") ?? "").trim(),
        fields: {
          kind,
          name: String(fd.get("name") ?? "").trim(),
          about: String(fd.get("about") ?? ""),
          website: String(fd.get("website") ?? ""),
        },
      };
      if (details.password.length < MIN_PASSWORD_LENGTH) {
        setError(`Please use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }

      startTransition(async () => {
        const sent = await requestSignupCode({
          email: details.email,
          password: details.password,
          firstName: details.firstName,
          lastName: details.lastName,
        });
        if (!sent.ok) {
          setError(sent.error);
          return;
        }
        setAwaiting(details);
      });
      return;
    }

    startTransition(async () => {
      const result = await registerCreator(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/creator");
      router.refresh();
    });
  }

  /** Confirms the address, then registers the creator under that new session. */
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
    fd.set("kind", awaiting.fields.kind);
    fd.set("name", awaiting.fields.name);
    fd.set("about", awaiting.fields.about);
    fd.set("website", awaiting.fields.website);
    const result = await registerCreator(fd);
    if (!result.ok) return result.error;

    router.replace("/creator");
    router.refresh();
    return null;
  }

  if (awaiting) {
    return (
      <OtpStep
        email={awaiting.email}
        submitLabel="Confirm and register"
        onVerify={verify}
        onResend={async () => {
          const sent = await requestSignupCode({
            email: awaiting.email,
            password: awaiting.password,
            firstName: awaiting.firstName,
            lastName: awaiting.lastName,
          });
          return sent.ok ? null : sent.error;
        }}
        onBack={() => setAwaiting(null)}
        backLabel="Change my details"
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <KindCard
          selected={kind === "author"}
          onSelect={() => setKind("author")}
          title="I'm an author"
          body="Put your own books in front of the club's members, and see what they sell."
        />
        <KindCard
          selected={kind === "publisher"}
          onSelect={() => setKind("publisher")}
          title="I'm a publisher"
          body="List the authors you publish, and submit their books on their behalf."
        />
      </div>

      {!signedIn ? (
        <>
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

      <Field
        label={kind === "publisher" ? "Publisher name" : "Your name as it appears on your books"}
        name="name"
        required
        maxLength={200}
      />

      <TextareaField
        label={kind === "publisher" ? "About the house" : "A short bio"}
        name="about"
        rows={4}
        maxLength={2000}
        hint="Shown to members beside your books."
      />

      {kind === "publisher" ? (
        <Field label="Website (optional)" name="website" maxLength={300} placeholder="https://" />
      ) : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? (signedIn ? "Registering…" : "Sending your code…") : "Register"}
      </Button>

      <p className="text-xs text-ink-muted">
        A Pick a Book admin reviews every author and publisher, and every book
        before it goes on sale.
      </p>
    </form>
  );
}

function KindCard({
  selected,
  onSelect,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`press rounded-xl border p-4 text-left transition-colors ${
        selected
          ? "border-brand-600 bg-brand-50"
          : "border-line-strong bg-surface hover:border-brand-500/60"
      }`}
    >
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{body}</p>
    </button>
  );
}
