"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextareaField } from "@/components/ui/Field";
import { getBrowserSupabaseClient } from "@/lib/supabase/browserClient";
import { saveShopBookOverrides } from "./actions";

const MAX_COVER_BYTES = 5 * 1024 * 1024;

export type ShopBookItem = {
  id: number;
  storeId: number;
  title: string;
  author: string;
  isbn: string | null;
  category: string | null;
  description: string | null;
  priceLkr: string;
  /** What the store charges, before anything the club set. */
  storePriceLkr: string;
  priceIsOurs: boolean;
  stock: number;
  coverUrl: string | null;
  coverIsOurs: boolean;
  editedAt: string | null;
};

/**
 * One book from the store, with the bits the club may override.
 *
 * Collapsed to a row until opened: this list is 1,336 books long, and a page
 * of 1,336 open forms is a page nobody can use.
 */
export function ShopBookRow({ book, userId }: { book: ShopBookItem; userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [description, setDescription] = useState(book.description ?? "");
  // Blank means "use the store's price", which is also how it is cleared.
  const [price, setPrice] = useState(book.priceIsOurs ? book.priceLkr : "");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(book.coverUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

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
    setSaved(false);
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const key = `${userId}/${book.storeId}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await getBrowserSupabaseClient()
      .storage.from("shop-covers")
      .upload(key, file, { contentType: file.type, upsert: false });
    setUploading(false);

    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    setCoverPath(key);
    setCoverPreview(URL.createObjectURL(file));
  }

  function save() {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await saveShopBookOverrides({
        id: book.id,
        coverPath: coverPath ?? undefined,
        // Sending the same value back is harmless: the override simply
        // matches the store's own, and clearing a field restores the store's.
        title: title.trim() === book.title ? undefined : title,
        author: author.trim() === book.author ? undefined : author,
        description:
          description.trim() === (book.description ?? "") ? undefined : description,
        // Always sent: an empty box is how a club puts the store's price back.
        price: price.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setCoverPath(null);
      router.refresh();
    });
  }

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex gap-3">
        <div className="grid h-20 w-14 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas-deep text-center text-[10px] text-ink-faint">
          {coverPreview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={coverPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-1">No cover</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{book.title}</p>
            {!book.coverUrl ? (
              <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[11px] font-medium text-warning-700">
                No cover
              </span>
            ) : book.coverIsOurs ? (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                Our cover
              </span>
            ) : null}
            {book.priceIsOurs ? (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                Our price
              </span>
            ) : null}
            {book.stock === 0 ? (
              <span className="rounded-full bg-canvas-deep px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                Sold out
              </span>
            ) : null}
          </div>
          <p className="text-sm text-ink-muted">
            {[book.author, book.category, book.isbn].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            LKR {Number(book.priceLkr).toLocaleString("en-LK")} · {book.stock} in stock ·
            store id {book.storeId}
          </p>
        </div>

        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 rounded-xl border border-line bg-canvas p-3">
          {error ? <Notice>{error}</Notice> : null}
          {saved ? <Notice tone="success">Saved. Members see this now.</Notice> : null}

          <div className="flex items-start gap-3">
            <label className="press inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-brand-700 hover:bg-canvas">
              {uploading ? "Uploading…" : book.coverUrl ? "Replace cover" : "Upload a cover"}
              <input type="file" accept="image/*" onChange={onCover} className="sr-only" />
            </label>
            <p className="text-xs text-ink-muted">
              Used instead of the store&apos;s. Survives every catalogue sync.
            </p>
          </div>

          <Field
            label="Price (LKR)"
            name={`price-${book.id}`}
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={book.storePriceLkr}
            hint={`The store charges LKR ${Number(book.storePriceLkr).toLocaleString("en-LK")}. Leave this blank to use it. Members pay the club's discount off whichever applies.`}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Title"
              name={`title-${book.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
            />
            <Field
              label="Author"
              name={`author-${book.id}`}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={200}
            />
          </div>

          <TextareaField
            label="About the book"
            name={`description-${book.id}`}
            rows={3}
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            hint="Left blank, the store's own words show."
          />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={pending || uploading}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
