import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Filling the mirror from the store's own catalogue file.
 *
 * The shop reads store_books, not the store, so this is the only code that
 * talks to pickabook.lk -- and the only thing that breaks when it is down.
 * The last catalogue we saw keeps serving members in the meantime.
 *
 * Deliberately dropped on the floor: `cost`, `seller_payment` and
 * `competitor`. They are in the file, they are the club's own margins, and
 * the portal has no use for them -- so they are not copied into a database
 * that more people can read.
 */

const NON_FICTION = [
  "Business & Money",
  "Self-Help & Psychology",
  "Science & Technology",
  "History & Politics",
  "Biography & Memoir",
  "Health & Wellness",
];

type RawBook = {
  id?: number | string;
  title?: string;
  author?: string;
  isbn?: string | null;
  category?: string | null;
  description?: string | null;
  tagline?: string | null;
  price?: number | string;
  market_price?: number | string | null;
  marketPrice?: number | string | null;
  stock?: number | string;
  active?: boolean;
  featured?: boolean;
  image?: string | null;
  coverUrl?: string | null;
};

export type SyncOutcome = {
  fetched: number;
  written: number;
  retired: number;
  withCover: number;
};

function storeBase(): string {
  return (process.env.PAB_STORE_URL ?? "").trim().replace(/\/+$/, "");
}

function catalogueUrl(): string {
  const path = (process.env.PAB_STORE_BOOKS_PATH ?? "data/books.json").replace(/^\/+/, "");
  return `${storeBase()}/${path}`;
}

/** The cover, decided once here rather than on every page view. */
function coverFor(raw: RawBook): string | null {
  if (raw.coverUrl) return raw.coverUrl;

  const file = raw.image?.trim();
  if (file) {
    return /^https?:\/\//i.test(file)
      ? file
      : `${storeBase()}/images/${encodeURI(file.replace(/^\/+/, ""))}`;
  }

  // The store's own fallback: Open Library by ISBN, through our proxy.
  const isbn = raw.isbn?.replace(/[^0-9Xx]/g, "").toUpperCase() ?? "";
  if (/^[0-9]{9}[0-9X]$|^[0-9]{13}$/.test(isbn)) return `/api/covers/isbn/${isbn}`;
  return null;
}

/** The store's shelf order, as index.php's default_rank() computes it. */
function sortRank(raw: RawBook, hasCover: boolean): number {
  return (
    (raw.featured ? 4 : 0) +
    (hasCover ? 2 : 0) +
    (raw.category && NON_FICTION.includes(raw.category) ? 1 : 0)
  );
}

/**
 * Fetches the catalogue and writes it into the mirror.
 *
 * The supabase client must be one that can call sync_store_books -- a super
 * admin's session, or the service role for the scheduled run.
 */
export async function syncStoreBooks(
  supabase: SupabaseClient,
  options: { batchSize?: number } = {},
): Promise<SyncOutcome> {
  const url = catalogueUrl();
  if (!storeBase()) throw new Error("PAB_STORE_URL is not set");

  const token = process.env.PAB_STORE_TOKEN?.trim();
  const response = await fetch(url, {
    headers: token ? { "X-PAB-Token": token } : undefined,
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`the store answered ${response.status}`);

  const payload = (await response.json()) as RawBook[] | { books?: RawBook[] };
  const rows = Array.isArray(payload) ? payload : (payload.books ?? []);

  // The cutoff is taken BEFORE the first write: anything still carrying an
  // older synced_at at the end was not in this catalogue.
  const startedAt = new Date().toISOString();

  const books = rows
    .filter((raw) => raw.active !== false && raw.id != null)
    .map((raw) => {
      const cover = coverFor(raw);
      return {
        id: Number(raw.id),
        title: String(raw.title ?? "").trim() || "Untitled",
        author: String(raw.author ?? "").trim(),
        isbn: raw.isbn ?? null,
        category: raw.category ?? null,
        // The store keeps a one-line tagline as well as a blurb; most books
        // have one or the other.
        description: (raw.description?.trim() || raw.tagline?.trim()) ?? null,
        price: Number(raw.price ?? 0),
        market_price: raw.market_price ?? raw.marketPrice ?? null,
        stock: Number(raw.stock ?? 0),
        featured: Boolean(raw.featured),
        image: raw.image ?? null,
        cover_url: cover,
        sort_rank: sortRank(raw, cover != null),
      };
    });

  const batchSize = options.batchSize ?? 250;
  let written = 0;
  for (let i = 0; i < books.length; i += batchSize) {
    const batch = books.slice(i, i + batchSize);
    const { data, error } = await supabase.rpc("sync_store_books", { p_books: batch });
    if (error) throw new Error(error.message);
    written += Number(data ?? 0);
  }

  const { data: retired, error: retireError } = await supabase.rpc(
    "retire_unsynced_store_books",
    { p_since: startedAt },
  );
  if (retireError) throw new Error(retireError.message);

  return {
    fetched: rows.length,
    written,
    retired: Number(retired ?? 0),
    withCover: books.filter((b) => b.cover_url).length,
  };
}
