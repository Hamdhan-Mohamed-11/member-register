"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { removeLibraryBook, saveLibraryBook } from "./actions";
import { ShelfCsvImport } from "./ShelfCsvImport";
import { BLANK_DRAFT, ShelfForm, ShelfFormActions, type Draft } from "./ShelfForm";

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
 * The club's lending shelf.
 *
 * Adding a book is a panel across the top rather than a column beside the
 * list: in a column the form was taller than the screen, so its Save button
 * sat below the fold and every save meant scrolling past the whole shelf to
 * find it.
 *
 * Editing happens in a dialog over the page, for the same reason in reverse
 * -- a form that opens where you are reading, saves, and gets out of the way,
 * instead of sending you to the top of a list of eighty books and losing your
 * place in it.
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
  const [adding, setAdding] = useState<Draft>(BLANK_DRAFT);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<number | null>(null);

  // Escape closes the dialog, and the page behind it stops scrolling while it
  // is open: the two things every dialog is expected to do.
  useEffect(() => {
    if (!editing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [editing]);

  const isEditing = editing != null;
  const draft = editing ?? adding;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (isEditing) setEditing((d) => (d ? { ...d, [key]: value } : d));
    else setAdding((d) => ({ ...d, [key]: value }));
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
    set("coverPath", key);
    set("coverUrl", URL.createObjectURL(file));
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const current = draft;

    startTransition(async () => {
      const result = await saveLibraryBook({
        id: current.id,
        title: current.title,
        author: current.author,
        isbn: current.isbn,
        category: current.category,
        description: current.description,
        // Only send a cover when one was chosen: undefined means "leave the
        // one that is there".
        coverPath: current.coverPath || undefined,
        copies: Number(current.copies || 0),
        shelfMark: current.shelfMark,
        isActive: current.isActive,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNotice(
        current.id != null ? `${current.title} updated.` : `${current.title} is on the shelf.`,
      );
      if (current.id != null) {
        setEditing(null);
      } else {
        setAdding(BLANK_DRAFT);
        setAddOpen(false);
      }
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
      setNotice(
        result.data?.what === "retired"
          ? "Taken off the shelf. It stays on record because it has been borrowed before."
          : "Removed.",
      );
      if (editing?.id === id) setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {notice && !isEditing ? <Notice tone="success">{notice}</Notice> : null}
      {error && !isEditing && !addOpen ? <Notice>{error}</Notice> : null}

      <ShelfCsvImport />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Add a book to the shelf</p>
            <p className="text-xs text-ink-muted">
              One at a time. For a whole shelf, use the importer above.
            </p>
          </div>
          {addOpen ? (
            <ShelfFormActions
              editing={false}
              pending={pending}
              uploading={uploading}
              formId="shelf-add"
              onCancel={() => {
                setAdding(BLANK_DRAFT);
                setAddOpen(false);
                setError(null);
              }}
            />
          ) : (
            <Button onClick={() => setAddOpen(true)}>Add a book</Button>
          )}
        </div>

        {addOpen ? (
          <div className="mt-4 border-t border-line pt-4">
            <ShelfForm
              formId="shelf-add"
              draft={adding}
              onChange={set}
              onSubmit={save}
              onCover={onCover}
              categories={categories}
              uploading={uploading}
              pending={pending}
              error={error}
              notice={null}
            />
          </div>
        ) : null}
      </Card>

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
            Nothing on the shelf yet. Add the first book above, or import a list.
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
                      setEditing(toDraft(book));
                      setError(null);
                      setNotice(null);
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

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shelf-edit-title"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setEditing(null)}
            className="reveal-fade absolute inset-0 bg-brand-950/55 backdrop-blur-[2px]"
          />

          <div className="reveal relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-panel bg-surface shadow-band sm:rounded-panel">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <p id="shelf-edit-title" className="truncate font-display text-lg text-ink">
                {editing.title || "Edit book"}
              </p>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close"
                className="press grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-canvas hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  className="size-5"
                  aria-hidden
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <ShelfForm
                formId="shelf-edit"
                draft={editing}
                onChange={set}
                onSubmit={save}
                onCover={onCover}
                categories={categories}
                uploading={uploading}
                pending={pending}
                error={error}
                notice={null}
              />
            </div>

            {/* The footer belongs to the dialog, not to the scrolling form, so
                Save is in the same place however long the blurb is. */}
            <div className="border-t border-line bg-canvas px-4 py-3 sm:px-5">
              <ShelfFormActions
                editing
                pending={pending}
                uploading={uploading}
                formId="shelf-edit"
                onCancel={() => setEditing(null)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
