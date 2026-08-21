"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { createCompany, inviteEmployees, type InviteOutcome } from "./actions";

export function CreateCompanyForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);
    const fd = new FormData(event.currentTarget);
    const form = event.currentTarget;

    startTransition(async () => {
      const result = await createCompany(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setDone(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {done ? (
        <Notice tone="success">
          Company added, along with its private club. Invite its employees below.
        </Notice>
      ) : null}

      <Field label="Company name" name="name" required placeholder="Acme Ltd" />

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Contact email" name="contactEmail" type="email" />
        <Field label="Contact phone" name="contactPhone" />
      </div>

      <Field
        label="Club name"
        name="clubName"
        placeholder="Acme Book Club"
        hint="Leave blank to name it after the company."
      />

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Membership fee (LKR)"
          name="feeLkr"
          type="number"
          min={0}
          step="0.01"
          hint="Blank uses the default fee."
        />
        <Field
          label="Term (months)"
          name="termMonths"
          type="number"
          min={1}
          hint="Blank uses the default term."
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add company"}
      </Button>
    </form>
  );
}

export function InviteEmployeesForm({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOutcome(null);
    const fd = new FormData(event.currentTarget);
    fd.set("clubId", clubId);
    const form = event.currentTarget;

    startTransition(async () => {
      const result = await inviteEmployees(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOutcome(result.data ?? null);
      if (result.data?.invited.length) form.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error ? <Notice>{error}</Notice> : null}

      {outcome ? (
        <div className="space-y-2">
          {outcome.invited.length ? (
            <Notice tone="success">
              Invited {outcome.invited.length}{" "}
              {outcome.invited.length === 1 ? "person" : "people"} to {clubName}.
            </Notice>
          ) : null}
          {outcome.failed.length ? (
            <div className="rounded-lg bg-warning-100 px-3 py-2.5 text-sm text-warning-600">
              <p className="font-medium">
                {outcome.failed.length}{" "}
                {outcome.failed.length === 1 ? "address" : "addresses"} didn&apos;t go
                through:
              </p>
              <ul className="mt-1 space-y-0.5">
                {outcome.failed.map((f) => (
                  <li key={f.email}>
                    <span className="font-medium">{f.email}</span> — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <TextareaField
        label="Employee emails"
        name="emails"
        required
        placeholder={"ada@acme.lk\ngrace@acme.lk, alan@acme.lk"}
        hint="One per line or comma separated. “Name <a@b.com>” works too."
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Sending invites…" : "Send invites"}
      </Button>
    </form>
  );
}
