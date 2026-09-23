"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { addAuthor } from "../actions";

export function AddAuthorForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAdded(null);
    const fd = new FormData(event.currentTarget);
    const name = String(fd.get("name") ?? "");

    startTransition(async () => {
      const result = await addAuthor(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setAdded(name);
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-3 space-y-3">
      {error ? <Notice>{error}</Notice> : null}
      {added ? <Notice tone="success">{added} was added to your list.</Notice> : null}

      <Field label="Name" name="name" required maxLength={200} disabled={disabled} />
      <TextareaField
        label="A short bio"
        name="bio"
        rows={3}
        maxLength={2000}
        disabled={disabled}
      />
      <Button type="submit" disabled={pending || disabled} className="w-full">
        {pending ? "Adding…" : "Add author"}
      </Button>
    </form>
  );
}
