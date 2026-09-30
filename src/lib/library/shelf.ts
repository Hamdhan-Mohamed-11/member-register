import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { getSupabaseUrl } from "@/lib/supabase/env";

/**
 * The club's own lending shelf.
 *
 * Borrowing used to read the old shop's catalogue. That database was emptied
 * from under us, so the books the club actually lends now live here, in the
 * portal, where nobody else can clear them.
 */

/** Where shelf ids begin, mirroring the store's and the authors'. */
export const SHELF_BOOK_ID_BASE = 7_000_000;
const SHELF_ID_CEILING = 8_000_000;

export function isShelfBookId(id: number): boolean {
  return Number.isFinite(id) && id >= SHELF_BOOK_ID_BASE && id < SHELF_ID_CEILING;
}

export function shelfCoverUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${getSupabaseUrl()}/storage/v1/object/public/library-covers/${path}`;
}

export type ShelfBook = {
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
  /** Copies currently with a member. */
  out: number;
  available: number;
};

type Row = {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
  category: string | null;
  description: string | null;
  cover_path: string | null;
  copies: number;
  shelf_mark: string | null;
  is_active: boolean;
  out_count: number | string;
  available: number;
};

function toShelfBook(row: Row): ShelfBook {
  return {
    id: Number(row.id),
    title: row.title,
    author: row.author ?? "",
    isbn: row.isbn,
    category: row.category,
    description: row.description,
    coverPath: row.cover_path,
    coverUrl: shelfCoverUrl(row.cover_path),
    copies: Number(row.copies),
    shelfMark: row.shelf_mark,
    isActive: row.is_active,
    out: Number(row.out_count),
    available: Number(row.available),
  };
}

/**
 * The shelf.
 *
 * `all` includes retired books and is for the admin screen; a member sees
 * only what is on the shelf today.
 */
export async function listShelf(options: {
  search?: string;
  category?: string;
  all?: boolean;
} = {}): Promise<ShelfBook[]> {
  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase.rpc("library_shelf_books", {
    p_search: options.search?.trim() || undefined,
    p_category: options.category?.trim() || undefined,
    p_all: options.all ?? false,
  });

  if (error) {
    console.error("[library] shelf:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map(toShelfBook);
}

export async function getShelfBook(id: number): Promise<ShelfBook | null> {
  const books = await listShelf({ all: true });
  return books.find((b) => b.id === id) ?? null;
}

/** The categories in use, for the filter chips. Derived, never typed twice. */
export function shelfCategories(books: ShelfBook[]): { id: string; label: string }[] {
  const seen = new Map<string, number>();
  for (const book of books) {
    if (!book.category) continue;
    seen.set(book.category, (seen.get(book.category) ?? 0) + 1);
  }
  return [...seen.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ id: label, label }));
}

/** Titles and covers for borrow requests, so the admin queue can show them. */
export async function getShelfSnapshots(
  ids: number[],
): Promise<Map<number, { title: string; author: string; priceLkr: string; imageUrl: string | null }>> {
  const wanted = new Set(ids.filter(isShelfBookId));
  const map = new Map<number, { title: string; author: string; priceLkr: string; imageUrl: string | null }>();
  if (wanted.size === 0) return map;

  const books = await listShelf({ all: true });
  for (const book of books) {
    if (!wanted.has(book.id)) continue;
    map.set(book.id, {
      title: book.title,
      author: book.author,
      // Nothing on the shelf is for sale; the shape is shared with the shop
      // snapshots so every page can ask one question.
      priceLkr: "0.00",
      imageUrl: book.coverUrl,
    });
  }
  return map;
}
