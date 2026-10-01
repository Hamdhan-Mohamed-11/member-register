import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import type { BookQuery, LegacyBook, LegacyCategory } from "@/lib/legacy/types";
import { PAGE_SIZE } from "@/lib/legacy/types";

/**
 * The PaB Store: the catalogue members buy from.
 *
 * The shop reads the MIRROR of that catalogue in store_books, not the store
 * itself. The store's file lives on someone else's hosting, and this portal
 * has already watched one book catalogue be emptied out from under it -- the
 * lending shelf went blank with it. A sync fills the mirror (see sync.ts);
 * everything below only ever reads our own database, so a store that is down,
 * migrated or cleared costs members nothing but freshness.
 *
 * BORROWING does not come through here. The club lends its own books from its
 * own shelf, which is library_shelf.
 */

/**
 * Where a store book's id starts inside the portal.
 *
 * The store numbers its books from 1, and so did the old catalogue, so the
 * two would collide in `cart_items.book_id`, in `book_order_items`, and in
 * every wishlist row already saved. Eight million is clear of the old
 * catalogue's ids (tens of thousands) and below the nine million where the
 * club's own authors start.
 */
export const STORE_BOOK_ID_BASE = 8_000_000;
const STORE_ID_CEILING = 9_000_000;

export function isStoreBookId(id: number): boolean {
  return Number.isFinite(id) && id >= STORE_BOOK_ID_BASE && id < STORE_ID_CEILING;
}

export function toStoreId(storeId: number): number {
  return STORE_BOOK_ID_BASE + storeId;
}

export function fromStoreId(id: number): number {
  return id - STORE_BOOK_ID_BASE;
}

export type StoreBook = LegacyBook & {
  /** What the store says the book is worth before its own discount. */
  marketPriceLkr: string | null;
  /** Copies the store has. 0 means it shows, sold out. */
  stock: number;
  featured: boolean;
  /** The book's page on the store, for anyone who wants the original. */
  storeUrl: string | null;
};

type Row = {
  id: number;
  store_id: number;
  title: string;
  author: string;
  isbn: string | null;
  category: string | null;
  description: string | null;
  price_lkr: number | string;
  market_price_lkr: number | string | null;
  stock: number;
  featured: boolean;
  cover_url: string | null;
};

export function isStoreConfigured(): boolean {
  return Boolean(process.env.PAB_STORE_URL?.trim());
}

function storeBase(): string {
  return (process.env.PAB_STORE_URL ?? "").trim().replace(/\/+$/, "");
}

/** Rupees as a string. A float through JS and back comes out a cent short. */
function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function toBook(row: Row): StoreBook {
  return {
    id: Number(row.id),
    title: row.title,
    author: row.author ?? "",
    bookBy: "",
    priceLkr: money(row.price_lkr),
    description: row.description,
    isbn: row.isbn,
    edition: null,
    imageUrl: row.cover_url,
    categoryLabel: row.category,
    // A book with no copies still appears, marked sold out: somebody was told
    // about it somewhere, and a book that vanishes teaches them nothing.
    inStock: Number(row.stock) > 0,
    // Nothing in the store is lendable: the club lends from its own shelf.
    lendable: false,
    marketPriceLkr: row.market_price_lkr == null ? null : money(row.market_price_lkr),
    stock: Number(row.stock) || 0,
    featured: Boolean(row.featured),
    storeUrl: storeBase() ? `${storeBase()}/book.php?id=${row.store_id}` : null,
  };
}

const COLUMNS =
  "id, store_id, title, author, isbn, category, description, price_lkr, market_price_lkr, stock, featured, cover_url";

export type StoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unconfigured" | "unreachable" };

export type StoreListing = {
  books: StoreBook[];
  total: number;
  page: number;
  pages: number;
};

/**
 * A page of the shop.
 *
 * Filtered, ordered and paged in the database. sort_rank is the store's own
 * shelf order -- featured first, then books with a cover, then non-fiction --
 * worked out once at sync time rather than on every request.
 */
export async function listStoreBooks(query: BookQuery = {}): Promise<StoreResult<StoreListing>> {
  const supabase = await getServerComponentSupabase();

  let rows = supabase
    .from("store_books")
    .select(COLUMNS, { count: "exact" })
    .eq("is_active", true);

  if (query.category) rows = rows.eq("category", query.category);
  if (query.availability === "in_stock") rows = rows.gt("stock", 0);
  if (query.availability === "pre_order") rows = rows.eq("stock", 0);
  if (query.minPriceLkr != null) rows = rows.gte("price_lkr", query.minPriceLkr);
  if (query.maxPriceLkr != null) rows = rows.lte("price_lkr", query.maxPriceLkr);

  const search = query.search?.trim();
  if (search) {
    // Escaped: a comma or a parenthesis in the search box is PostgREST
    // syntax, and an unescaped one turns a search into a 400.
    const safe = search.replace(/[%,()]/g, " ").trim();
    if (safe) {
      rows = rows.or(
        `title.ilike.%${safe}%,author.ilike.%${safe}%,isbn.ilike.%${safe}%`,
      );
    }
  }

  const page = Math.max(1, query.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;

  const { data, count, error } = await rows
    .order("sort_rank", { ascending: false })
    .order("store_id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error("[store] listing:", error.message);
    return { ok: false, reason: "unreachable" };
  }

  const total = count ?? 0;
  return {
    ok: true,
    data: {
      books: ((data ?? []) as unknown as Row[]).map(toBook),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
  };
}

export async function getStoreBook(id: number): Promise<StoreResult<StoreBook | null>> {
  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase
    .from("store_books")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[store] book:", error.message);
    return { ok: false, reason: "unreachable" };
  }
  return { ok: true, data: data ? toBook(data as unknown as Row) : null };
}

export async function listStoreCategories(): Promise<StoreResult<LegacyCategory[]>> {
  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase
    .from("store_books")
    .select("category")
    .eq("is_active", true)
    .not("category", "is", null);

  if (error) {
    console.error("[store] categories:", error.message);
    return { ok: false, reason: "unreachable" };
  }

  const seen = new Set(((data ?? []) as { category: string }[]).map((r) => r.category));
  return {
    ok: true,
    data: [...seen]
      .sort((a, b) => a.localeCompare(b))
      .map((label) => ({ id: label, label })),
  };
}

export type StoreSnapshot = {
  title: string;
  author: string;
  priceLkr: string;
  imageUrl: string | null;
};

/** Titles and prices for cart lines, wishlists and past orders. */
export async function getStoreSnapshots(ids: number[]): Promise<Map<number, StoreSnapshot>> {
  const wanted = [...new Set(ids.filter(isStoreBookId))];
  const map = new Map<number, StoreSnapshot>();
  if (wanted.length === 0) return map;

  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase
    .from("store_books")
    .select("id, title, author, price_lkr, cover_url")
    .in("id", wanted);

  if (error) {
    console.error("[store] snapshots:", error.message);
    return map;
  }

  for (const row of (data ?? []) as unknown as {
    id: number;
    title: string;
    author: string;
    price_lkr: number | string;
    cover_url: string | null;
  }[]) {
    map.set(Number(row.id), {
      title: row.title,
      author: row.author ?? "",
      priceLkr: money(row.price_lkr),
      imageUrl: row.cover_url,
    });
  }
  return map;
}
