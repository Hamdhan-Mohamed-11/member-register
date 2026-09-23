"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, SelectField, TextareaField } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { submitBook } from "../../actions";

const MAX_COVER_BYTES = 5 * 1024 * 1024;

export type AuthorOption = { id: string; name: string };

/**
 * Submitting a book.
 *
 * The cover is uploaded from the browser straight into storage before the
 * action runs, and only its path travels through the form. A 5MB image
 * through a server action would be a 5MB request body, and Next caps those
 * well below what a phone camera produces.
 */
export function SubmitBookForm({
  authors,
  userId,
}: {
  authors: AuthorOption[];
  userId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image.");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setError("That image is too large. Please pick one under 5MB.");
      return;
    }

    setError(null);
    setUploading(true);
    // Under the creator's own user id: the storage policy allows writes only
    // inside that folder, so one author cannot overwrite another's cover.
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const key = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await getBrowserSupabaseClient()
      .storage.from("book-covers")
      .upload(key, file, { contentType: file.type, upsert: false });
    setUploading(false);

    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    setCoverPath(key);
    setCoverPreview(URL.createObjectURL(file));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    if (coverPath) fd.set("coverPath", coverPath);

    startTransition(async () => {
      const result = await submitBook(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/creator");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}

      {authors.length > 1 ? (
        <SelectField label="Author" name="authorId" required>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
      ) : (
        <>
          <input type="hidden" name="authorId" value={authors[0]?.id ?? ""} />
          <p className="text-sm text-ink-muted">
            Submitting as <span className="font-medium text-ink">{authors[0]?.name}</span>.
          </p>
        </>
      )}

      <Field label="Title" name="title" required maxLength={300} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Price (LKR)"
          name="priceLkr"
          type="number"
          min={0}
          step="0.01"
          required
          hint="What the book sells for. Members pay the club's member price."
        />
        <Field label="ISBN (optional)" name="isbn" maxLength={40} />
      </div>

      <TextareaField
        label="About the book"
        name="blurb"
        rows={5}
        maxLength={4000}
        hint="What a member reads before deciding. A few sentences is plenty."
      />

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Cover</p>
        <div className="flex items-start gap-3">
          <div className="grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas-deep text-center text-[11px] text-ink-faint">
            {coverPreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={coverPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="px-1">No cover</span>
            )}
          </div>
          <div>
            <label className="press inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas">
              {uploading ? "Uploading…" : coverPath ? "Replace cover" : "Upload a cover"}
              <input type="file" accept="image/*" onChange={onCover} className="sr-only" />
            </label>
            <p className="mt-1 text-xs text-ink-muted">
              Shown on the book&apos;s page in the shop. Up to 5MB.
            </p>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={pending || uploading} className="w-full sm:w-auto">
        {pending ? "Submitting…" : "Submit for approval"}
      </Button>
    </form>
  );
}
