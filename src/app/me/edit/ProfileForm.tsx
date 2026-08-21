"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { updateProfile } from "./actions";

export function ProfileForm({
  firstName,
  lastName,
  phone,
  bio,
  learningTags,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  bio: string;
  learningTags: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateProfile(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice tone="success">Profile saved.</Notice> : null}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="First name"
          name="firstName"
          defaultValue={firstName}
          required
          autoComplete="given-name"
        />
        <Field
          label="Last name"
          name="lastName"
          defaultValue={lastName}
          autoComplete="family-name"
        />
      </div>

      <Field
        label="Phone"
        name="phone"
        defaultValue={phone}
        autoComplete="tel"
        hint="Visible to club admins and members you share a club with."
      />

      <TextareaField
        label="About you"
        name="bio"
        defaultValue={bio}
        placeholder="What you like to read, what you're looking for in a book club…"
      />

      <Field
        label="Currently learning"
        name="learningTags"
        defaultValue={learningTags.join(", ")}
        placeholder="Sinhala, watercolour, chess"
        hint="Comma separated."
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
