import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { bookCoverUrl } from "@/lib/creators/url";
import type { LegacyBook } from "@/lib/legacy/types";

/**
 * Where the club's own authors' ids begin.
 *
 * The legacy catalogue's ids are in the tens of thousands and climb by one
 * per book; nine million leaves room for both to grow for as long as anyone
 * reading this will care. Anything at or above this is an author book, which
 * is how the shop pages, the cart and the orders tell them apart with no
 * extra column to carry around.
 */
export const AUTHOR_BOOK_ID_BASE = 9_000_000;

export function isAuthorBookId(id: number): boolean {
  return Number.isFinite(id) && id >= AUTHOR_BOOK_ID_BASE;
}

/**
 * An author's book in the shape the shop already speaks.
 *
 * Returning LegacyBook means BookCard, the detail page and the cart need no
 * branch for where a book came from -- the only difference a member should
 * ever notice is the line saying it is one of the club's own authors.
 */
export type ClubAuthorBook = LegacyBook & { authorBook: true };

type Row = {
  id: number;
  title: string;
  blurb: string | null;
  isbn: string | null;
  price_lkr: string;
  cover_path: string | null;
  authors: { name: string } | null;
  publishers: { name: string } | null;
};

function toBook(row: Row): ClubAuthorBook {
  return {
    id: Number(row.id),
    title: row.title,
    author: row.authors?.name ?? "",
    bookBy: row.publishers?.name ?? "",
    priceLkr: String(row.price_lkr),
    description: row.blurb,
    isbn: row.isbn,
    edition: null,
    imageUrl: bookCoverUrl(row.cover_path),
    categoryLabel: "Our authors",
    // Sold to order like everything else here, and never lent: these are the
    // author's own copies, not the club's shelf.
    inStock: true,
    lendable: false,
    authorBook: true,
  };
}

const SELECT =
  "id, title, blurb, isbn, price_lkr, cover_path, authors ( name ), publishers ( name )";

/**
 * Approved books by the club's own authors.
 *
 * Unpaged on purpose: this is a handful of books, shown as its own shelf above
 * a catalogue of eighteen thousand. If it ever stops being a handful it needs
 * a page of its own, not a page number here.
 */
export async function listClubAuthorBooks(search?: string): Promise<ClubAuthorBook[]> {
  const supabase = await getServerComponentSupabase();

  let query = supabase
    .from("author_books")
    .select(SELECT)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(24);

  const term = search?.trim();
  if (term) query = query.ilike("title", `%${term}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[shop] author books:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map(toBook);
}

/** One author book, for its shop page. Null if it is not on sale. */
export async function getClubAuthorBook(id: number): Promise<ClubAuthorBook | null> {
  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase
    .from("author_books")
    .select(SELECT)
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();

  if (error) console.error("[shop] author book:", error.message);
  return data ? toBook(data as unknown as Row) : null;
}

export type AuthorBookSnapshot = {
  title: string;
  author: string;
  priceLkr: string;
  imageUrl: string | null;
};

/**
 * Prices and titles for the cart and the order pages.
 *
 * Deliberately NOT restricted to approved books: a member who added a book to
 * their cart before it was withdrawn still has it there, and a cart line with
 * no title and a price of zero is worse than one that says what it is. The
 * checkout is where an unavailable book should be refused, once, with a
 * reason.
 */
export async function getAuthorBookSnapshots(
  ids: number[],
): Promise<Map<number, AuthorBookSnapshot>> {
  const wanted = [...new Set(ids)].filter(isAuthorBookId);
  if (wanted.length === 0) return new Map();

  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase
    .from("author_books")
    .select("id, title, price_lkr, cover_path, authors ( name )")
    .in("id", wanted);

  if (error) {
    console.error("[shop] author book snapshots:", error.message);
    return new Map();
  }

  type SnapRow = {
    id: number;
    title: string;
    price_lkr: string;
    cover_path: string | null;
    authors: { name: string } | null;
  };

  const map = new Map<number, AuthorBookSnapshot>();
  for (const row of (data ?? []) as unknown as SnapRow[]) {
    map.set(Number(row.id), {
      title: row.title,
      author: row.authors?.name ?? "",
      priceLkr: String(row.price_lkr),
      imageUrl: bookCoverUrl(row.cover_path),
    });
  }
  return map;
}
