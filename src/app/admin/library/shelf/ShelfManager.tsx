"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { removeLibraryBook, saveLibraryBook } from "./actions";
import { ShelfCsvImport } from "./ShelfCsvImport";

const MAX_COVER_BYTES = 5 * 1024 * 1024;

export type ShelfRow = {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
  category: string | null;
  description: string | null;
  coverPath: string | null;
  coverUrl: string | null;
  copies: number;
  shelfMark: string | null;
  isActive: boolean;
  out: number;
  available: number;
};

type Draft = {
  id?: number;
  title: string;
  author: string;
  isbn: string;
  category: string;
  description: string;
  coverPath: string;
  coverUrl: string | null;
  copies: string;
  shelfMark: string;
  isActive: boolean;
};

const BLANK: Draft = {
  title: "",
  author: "",
  isbn: "",
  category: "",
  description: "",
  coverPath: "",
  coverUrl: null,
  copies: "1",
  shelfMark: "",
  isActive: true,
};

function toDraft(book: ShelfRow): Draft {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn ?? "",
    category: book.category ?? "",
    description: book.description ?? "",
    coverPath: book.coverPath ?? "",
    coverUrl: book.coverUrl,
    copies: String(book.copies),
    shelfMark: book.shelfMark ?? "",
    isActive: book.isActive,
  };
}

/**
 * The club's lending shelf: what is on it, and the form that puts it there.
 *
 * The form and the list are one component because adding a book and editing
 * one are the same form, and a separate edit page would mean losing your
 * place in a list of eighty books to correct a typo.
 */
export function ShelfManager({
  books,
  categories,
  userId,
}: {
  books: ShelfRow[];
  categories: string[];
  userId: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<number | null>(null);

  const editing = draft.id != null;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function onCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("A cover needs to be an image.");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setError("That image is over 5MB. Please pick a smaller one.");
      return;
    }

    setError(null);
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const key = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await getBrowserSupabaseClient()
      .storage.from("library-covers")
      .upload(key, file, { contentType: file.type, upsert: false });
    setUploading(false);

    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    setDraft((d) => ({ ...d, coverPath: key, coverUrl: URL.createObjectURL(file) }));
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(null);

    startTransition(async () => {
      const result = await saveLibraryBook({
        id: draft.id,
        title: draft.title,
        author: draft.author,
        isbn: draft.isbn,
        category: draft.category,
        description: draft.description,
        // Only send a cover when one was chosen: undefined means "leave the
        // one that is there".
        coverPath: draft.coverPath || undefined,
        copies: Number(draft.copies || 0),
        shelfMark: draft.shelfMark,
        isActive: draft.isActive,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(editing ? `${draft.title} updated.` : `${draft.title} is on the shelf.`);
      setDraft(BLANK);
      router.refresh();
    });
  }

  function remove(id: number) {
    setError(null);
    startTransition(async () => {
      const result = await removeLibraryBook(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      setSaved(
        result.data?.what === "retired"
          ? "Taken off the shelf. It stays on record because it has been borrowed before."
          : "Removed.",
      );
      if (draft.id === id) setDraft(BLANK);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
      <Card className="lg:sticky lg:top-6">
        <p className="mb-3 text-sm font-medium text-ink">
          {editing ? "Edit this book" : "Add a book to the shelf"}
        </p>

        <form onSubmit={save} className="space-y-3">
          {error ? <Notice>{error}</Notice> : null}
          {saved ? <Notice tone="success">{saved}</Notice> : null}

          <div className="flex items-start gap-3">
            <div className="grid h-28 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas-deep text-center text-[11px] text-ink-faint">
              {draft.coverUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={draft.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="px-1">No cover</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <label className="press inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas">
                {uploading ? "Uploading…" : draft.coverUrl ? "Replace cover" : "Upload a cover"}
                <input type="file" accept="image/*" onChange={onCover} className="sr-only" />
              </label>
              <p className="mt-1 text-xs text-ink-muted">
                Shown to members on the library page. Up to 5MB.
              </p>
            </div>
          </div>

          <Field
            label="Title"
            name="title"
            required
            maxLength={300}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
          />
          <Field
            label="Author"
            name="author"
            maxLength={200}
            value={draft.author}
            onChange={(e) => set("author", e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Copies"
              name="copies"
              type="number"
              min={0}
              max={999}
              required
              value={draft.copies}
              onChange={(e) => set("copies", e.target.value)}
              hint="How many the club owns."
            />
            <Field
              label="Shelf mark"
              name="shelfMark"
              maxLength={60}
              value={draft.shelfMark}
              onChange={(e) => set("shelfMark", e.target.value)}
              hint="Where it lives, e.g. B3."
            />
          </div>

          <div>
            <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-ink">
              Category
            </label>
            <input
              id="category"
              name="category"
              list="shelf-categories"
              maxLength={120}
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full min-h-11 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25"
              placeholder="Fiction"
            />
            {/* The categories already in use, so the shelf does not end up with
                Fiction, fiction and Ficton. */}
            <datalist id="shelf-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <Field
            label="ISBN"
            name="isbn"
            maxLength={40}
            value={draft.isbn}
            onChange={(e) => set("isbn", e.target.value)}
          />

          <TextareaField
            label="About the book"
            name="description"
            rows={3}
            maxLength={4000}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              className="size-4 rounded border-line-strong accent-brand-600"
            />
            On the shelf — members can ask for it
          </label>

          {/*
            Stuck to the bottom of the form rather than sitting at the end of
            it. The form is taller than a phone screen, so saving an edit
            meant scrolling past every field to find the button -- and on the
            way past a list of eighty books, losing your place.
          */}
          <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-sm sm:-mx-5 sm:px-5">
            <Button type="submit" disabled={pending || uploading}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add to the shelf"}
            </Button>
            {editing ? (
              <Button type="button" variant="ghost" onClick={() => setDraft(BLANK)}>
                Cancel
              </Button>
            ) : null}
            {editing ? (
              <span className="self-center text-xs text-ink-muted">
                Editing {draft.title || "a book"}
              </span>
            ) : null}
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <ShelfCsvImport />

        <Card flush>
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <p className="text-sm font-medium text-ink">
            {books.length} {books.length === 1 ? "book" : "books"} on the shelf
          </p>
          <p className="text-xs text-ink-muted">
            Availability counts what members have out right now.
          </p>
        </div>

        {books.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted sm:px-5">
            Nothing on the shelf yet. Add the first book on the left.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {books.map((book) => (
              <li key={book.id} className="flex gap-3 px-4 py-3 sm:px-5">
                <div className="grid h-20 w-14 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas-deep text-center text-[10px] text-ink-faint">
                  {book.coverUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1">No cover</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{book.title}</p>
                    {!book.isActive ? (
                      <span className="rounded-full bg-canvas-deep px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                        Off the shelf
                      </span>
                    ) : book.available === 0 ? (
                      <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[11px] font-medium text-warning-700">
                        All out
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-ink-muted">
                    {[book.author, book.category, book.shelfMark].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {book.available} of {book.copies} free
                    {book.out > 0 ? ` · ${book.out} out` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraft(toDraft(book));
                      setSaved(null);
                      setError(null);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </Button>

                  {confirming === book.id ? (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => remove(book.id)}
                        disabled={pending}
                      >
                        Remove
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(book.id)}>
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        </Card>
      </div>
    </div>
  );
}
