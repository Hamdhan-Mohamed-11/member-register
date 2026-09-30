import "server-only";

import { cacheGet, cacheSet } from "@/lib/legacy/cache";
import type { BookQuery, LegacyBook, LegacyCategory } from "@/lib/legacy/types";
import { PAGE_SIZE } from "@/lib/legacy/types";

/**
 * The PaB Store: the catalogue members buy from.
 *
 * The shop used to read the old HostGator database directly. Buying now comes
 * from the store site instead, over the catalogue file it already publishes
 * at data/books.json -- the same file its own load_books() reads, so the two
 * can never disagree about what is for sale. BORROWING does not come through
 * here at all; the club lends its own books from its own shelf.
 *
 * Two shapes are accepted: that raw file, and the normalised one from
 * store-endpoint/books.json.php for an install that would rather not publish
 * its catalogue. Reading both is a dozen lines and means the portal does not
 * care which is in front of it.
 *
 * The whole catalogue arrives in one request and is cached in this process,
 * so searching, filtering and paging happen here rather than as a round trip
 * per keystroke. That is only reasonable while the store is in the low
 * thousands of books; past that this wants a query parameter on the endpoint
 * and paging on the store's side.
 */

/**
 * Where a store book's id starts inside the portal.
 *
 * The store numbers its books from 1, and so does the old catalogue, so the
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

type RawBook = {
  id: number;
  title?: string;
  author?: string;
  isbn?: string | null;
  category?: string | null;
  description?: string | null;
  tagline?: string | null;
  price?: number | string;
  /** The endpoint spells it one way, the store's own file the other. */
  marketPrice?: number | string | null;
  market_price?: number | string | null;
  stock?: number | string;
  active?: boolean;
  featured?: boolean;
  /** A bare filename in the store's images folder. */
  image?: string | null;
  coverUrl?: string | null;
  url?: string | null;
};

const CACHE_KEY = "store:books";
const TTL_MS = 60_000;
const TIMEOUT_MS = 8_000;

// One shared breaker, for the same reason the legacy layer has one: without
// it an unreachable store makes every catalogue page wait the full timeout.
const FAILURE_THRESHOLD = 3;
const OPEN_MS = 30_000;
let failures = 0;
let openedAt = 0;

function breakerOpen(): boolean {
  if (openedAt === 0) return false;
  if (Date.now() - openedAt > OPEN_MS) {
    openedAt = 0;
    failures = 0;
    return false;
  }
  return true;
}

export function isStoreConfigured(): boolean {
  return Boolean(process.env.PAB_STORE_URL?.trim());
}

function storeBase(): string {
  return (process.env.PAB_STORE_URL ?? "").trim().replace(/\/+$/, "");
}

function endpoint(): string {
  // The store already publishes its catalogue here; the PHP endpoint is for
  // an install that would rather it were not public.
  const path = (process.env.PAB_STORE_BOOKS_PATH ?? "data/books.json").replace(/^\/+/, "");
  return `${storeBase()}/${path}`;
}

/** Rupees as a string. A float through JS and back comes out a cent short. */
function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

/** A cover: an absolute URL as given, or a filename under the store's images. */
function coverFor(raw: RawBook): string | null {
  if (raw.coverUrl) return raw.coverUrl;
  const file = raw.image?.trim();
  if (!file) return null;
  if (/^https?:\/\//i.test(file)) return file;
  return `${storeBase()}/images/${encodeURI(file.replace(/^\/+/, ""))}`;
}

function toBook(raw: RawBook): StoreBook {
  const market = raw.marketPrice ?? raw.market_price ?? null;
  return {
    id: toStoreId(Number(raw.id)),
    title: raw.title || "Untitled",
    author: raw.author ?? "",
    bookBy: "",
    priceLkr: money(Number(raw.price ?? 0)),
    // The store keeps a one-line tagline as well as a blurb, and most books
    // have one or the other rather than both.
    description: raw.description?.trim() || raw.tagline?.trim() || null,
    isbn: raw.isbn ?? null,
    edition: null,
    imageUrl: coverFor(raw),
    categoryLabel: raw.category ?? null,
    // The store's own word for it. A book with no copies still appears --
    // members were told about it somewhere -- but cannot be added to a cart.
    inStock: Number(raw.stock) > 0,
    // Nothing in the store is lendable: the club lends from its own shelf,
    // which is the other catalogue.
    lendable: false,
    marketPriceLkr: market == null ? null : money(Number(market)),
    stock: Number(raw.stock) || 0,
    featured: Boolean(raw.featured),
    // Straight to the book on the store, for anyone who wants the original.
    storeUrl: raw.url ?? `${storeBase()}/book.php?id=${Number(raw.id)}`,
  };
}

/**
 * Every active book the store sells, cached for a minute.
 *
 * Returns null when the store is unreachable or not configured, so callers
 * can say so rather than showing an empty shop as though it were the truth.
 */
async function allBooks(): Promise<StoreBook[] | null> {
  if (!isStoreConfigured()) return null;

  const cached = cacheGet<StoreBook[]>(CACHE_KEY);
  if (cached) return cached;
  if (breakerOpen()) return null;

  try {
    const token = process.env.PAB_STORE_TOKEN?.trim();
    const response = await fetch(endpoint(), {
      headers: token ? { "X-PAB-Token": token } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Next would otherwise cache this at the fetch layer too, which would
      // fight the TTL above and make "why is the shop stale" two mysteries.
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`store responded ${response.status}`);

    const payload = (await response.json()) as RawBook[] | { books?: RawBook[] };
    const rows = Array.isArray(payload) ? payload : (payload.books ?? []);
    // `active` is the store's own word for "on sale". The endpoint filters
    // them out already; the raw file does not, so it is filtered here.
    const books = rows
      .filter((row) => row.active !== false && row.id != null)
      .map(toBook);

    failures = 0;
    cacheSet(CACHE_KEY, books, TTL_MS);
    return books;
  } catch (error) {
    failures += 1;
    if (failures >= FAILURE_THRESHOLD) openedAt = Date.now();
    console.error(
      "[store] catalogue fetch failed:",
      error instanceof Error ? error.message.slice(0, 200) : String(error),
    );
    return null;
  }
}

export type StoreResult<T> = { ok: true; data: T } | { ok: false; reason: "unconfigured" | "unreachable" };

function fail<T>(): StoreResult<T> {
  return { ok: false, reason: isStoreConfigured() ? "unreachable" : "unconfigured" };
}

export type StoreListing = {
  books: StoreBook[];
  total: number;
  page: number;
  pages: number;
};

const NON_FICTION = [
  "Business & Money",
  "Self-Help & Psychology",
  "Science & Technology",
  "History & Politics",
  "Biography & Memoir",
  "Health & Wellness",
];

/**
 * The store's own default order: featured first, then books with a cover,
 * then non-fiction, then newest.
 *
 * Copied deliberately rather than invented. A member who browses the store
 * and then the portal should see the same shelf in the same order; two
 * different "recommended" orders for one shop is a bug that never gets
 * reported, only felt.
 */
function defaultRank(book: StoreBook): number[] {
  return [
    book.featured ? 1 : 0,
    book.imageUrl ? 1 : 0,
    book.categoryLabel && NON_FICTION.includes(book.categoryLabel) ? 1 : 0,
    fromStoreId(book.id),
  ];
}

function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

export async function listStoreBooks(query: BookQuery = {}): Promise<StoreResult<StoreListing>> {
  const books = await allBooks();
  if (!books) return fail();

  const search = query.search?.trim().toLowerCase();
  const filtered = books.filter((book) => {
    if (query.category && book.categoryLabel !== query.category) return false;
    if (query.availability === "in_stock" && !book.inStock) return false;
    if (query.availability === "pre_order" && book.inStock) return false;

    const price = Number(book.priceLkr);
    if (query.minPriceLkr != null && price < query.minPriceLkr) return false;
    if (query.maxPriceLkr != null && price > query.maxPriceLkr) return false;

    if (search) {
      const hay = `${book.title} ${book.author} ${book.isbn ?? ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => compareRanks(defaultRank(a), defaultRank(b)));

  const page = Math.max(1, query.page ?? 1);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = (Math.min(page, pages) - 1) * PAGE_SIZE;

  return {
    ok: true,
    data: {
      books: filtered.slice(start, start + PAGE_SIZE),
      total: filtered.length,
      page: Math.min(page, pages),
      pages,
    },
  };
}

export async function getStoreBook(id: number): Promise<StoreResult<StoreBook | null>> {
  const books = await allBooks();
  if (!books) return fail();
  return { ok: true, data: books.find((b) => b.id === id) ?? null };
}

export async function listStoreCategories(): Promise<StoreResult<LegacyCategory[]>> {
  const books = await allBooks();
  if (!books) return fail();

  const counts = new Map<string, number>();
  for (const book of books) {
    if (!book.categoryLabel) continue;
    counts.set(book.categoryLabel, (counts.get(book.categoryLabel) ?? 0) + 1);
  }

  return {
    ok: true,
    data: [...counts.keys()]
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
  const wanted = new Set(ids.filter(isStoreBookId));
  if (wanted.size === 0) return new Map();

  const books = await allBooks();
  const map = new Map<number, StoreSnapshot>();
  if (!books) return map;

  for (const book of books) {
    if (!wanted.has(book.id)) continue;
    map.set(book.id, {
      title: book.title,
      author: book.author,
      priceLkr: book.priceLkr,
      imageUrl: book.imageUrl,
    });
  }
  return map;
}
