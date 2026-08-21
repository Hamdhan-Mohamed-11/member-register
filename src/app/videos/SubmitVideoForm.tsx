"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { submitVideo } from "./actions";

export function SubmitVideoForm({ isAdmin }: { isAdmin: boolean }) {
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
      const result = await submitVideo(fd);
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
          {isAdmin
            ? "Video added and published."
            : "Sent for review. You can see it on your own videos page in the meantime — it appears for everyone once a club admin approves it."}
        </Notice>
      ) : null}

      <Field
        label="Video link"
        name="url"
        required
        placeholder="https://youtu.be/…"
        hint="YouTube or Vimeo. Copy the address from your browser."
      />
      <Field label="Title" name="title" required placeholder="Our September session" />
      <TextareaField
        label="Description"
        name="description"
        placeholder="What's in it, and why it's worth watching."
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : isAdmin ? "Add video" : "Send for review"}
      </Button>
    </form>
  );
}
