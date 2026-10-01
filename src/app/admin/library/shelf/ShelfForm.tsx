"use client";

import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";

export type Draft = {
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

export const BLANK_DRAFT: Draft = {
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

/**
 * The fields for one shelf book.
 *
 * Shared by the panel that adds a book and the dialog that edits one, because
 * they ask for exactly the same things -- and a second copy of a nine-field
 * form is a second place for them to drift apart.
 *
 * The grid is what keeps it short: laid out in a single column the form was
 * taller than the screen, which is how the Save button ended up somewhere you
 * had to go looking for.
 */
export function ShelfForm({
  draft,
  onChange,
  onSubmit,
  onCover,
  categories,
  uploading,
  pending,
  error,
  notice,
  formId,
}: {
  draft: Draft;
  onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCover: (event: React.ChangeEvent<HTMLInputElement>) => void;
  categories: string[];
  uploading: boolean;
  pending: boolean;
  error: string | null;
  notice: string | null;
  formId: string;
}) {
  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <div className="grid gap-4 md:grid-cols-[9rem_1fr]">
        <div>
          <div className="grid h-44 w-32 place-items-center overflow-hidden rounded-lg border border-line bg-canvas-deep text-center text-[11px] text-ink-faint">
            {draft.coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={draft.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="px-2">No cover</span>
            )}
          </div>
          <label className="press mt-2 inline-flex min-h-9 w-32 cursor-pointer items-center justify-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas">
            {uploading ? "Uploading…" : draft.coverUrl ? "Replace" : "Upload a cover"}
            <input type="file" accept="image/*" onChange={onCover} className="sr-only" />
          </label>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Title"
              name="title"
              required
              maxLength={300}
              value={draft.title}
              onChange={(e) => onChange("title", e.target.value)}
            />
            <Field
              label="Author"
              name="author"
              maxLength={200}
              value={draft.author}
              onChange={(e) => onChange("author", e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field
              label="Copies"
              name="copies"
              type="number"
              min={0}
              max={999}
              required
              value={draft.copies}
              onChange={(e) => onChange("copies", e.target.value)}
            />
            <Field
              label="Shelf mark"
              name="shelfMark"
              maxLength={60}
              placeholder="B3"
              value={draft.shelfMark}
              onChange={(e) => onChange("shelfMark", e.target.value)}
            />
            <div>
              <label htmlFor={`${formId}-category`} className="mb-1.5 block text-sm font-medium text-ink">
                Category
              </label>
              <input
                id={`${formId}-category`}
                name="category"
                list={`${formId}-categories`}
                maxLength={120}
                placeholder="Fiction"
                value={draft.category}
                onChange={(e) => onChange("category", e.target.value)}
                className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25"
              />
              {/* The categories already in use, so a shelf does not end up
                  with Fiction, fiction and Ficton. */}
              <datalist id={`${formId}-categories`}>
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
              onChange={(e) => onChange("isbn", e.target.value)}
            />
          </div>

          <TextareaField
            label="About the book"
            name="description"
            rows={2}
            maxLength={4000}
            value={draft.description}
            onChange={(e) => onChange("description", e.target.value)}
          />

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => onChange("isActive", e.target.checked)}
              className="size-4 rounded border-line-strong accent-brand-600"
            />
            On the shelf — members can ask for it
          </label>
        </div>
      </div>

      {/* A submit inside the form, so Enter works and so the dialog's own
          footer button has something to point at. */}
      <button type="submit" className="sr-only" disabled={pending || uploading}>
        Save
      </button>
    </form>
  );
}

export function ShelfFormActions({
  editing,
  pending,
  uploading,
  formId,
  onCancel,
}: {
  editing: boolean;
  pending: boolean;
  uploading: boolean;
  formId: string;
  onCancel?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" form={formId} disabled={pending || uploading}>
        {pending ? "Saving…" : editing ? "Save changes" : "Add to the shelf"}
      </Button>
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
