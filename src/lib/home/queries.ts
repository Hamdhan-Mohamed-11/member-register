import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { getShopSnapshots } from "@/lib/shop/snapshots";

export type PopularBook = {
  bookId: number;
  title: string;
  author: string;
  members: number;
  imageUrl: string | null;
};

/**
 * The catalogue books the most members have ordered, borrowed or wishlisted,
 * with covers from the live catalogue. Counts only. Works signed out.
 */
export async function getPopularBooks(limit = 6): Promise<PopularBook[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.rpc("popular_books", { p_limit: limit });
  const rows = (data ?? []) as unknown as {
    book_id: number;
    title: string;
    author: string;
    members: number | string;
  }[];

  const byId = await getShopSnapshots(rows.map((r) => Number(r.book_id)));

  return rows.map((r) => {
    const snap = byId.get(Number(r.book_id));
    return {
      bookId: Number(r.book_id),
      title: snap?.title || r.title,
      author: snap?.author || r.author,
      members: Number(r.members),
      imageUrl: snap?.imageUrl ?? null,
    };
  });
}

export type PublicStats = {
  members: number;
  clubs: number;
  sessionsHeld: number;
  booksFunded: number;
};

export async function getPublicStats(): Promise<PublicStats | null> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.rpc("public_stats");
  const row = ((data ?? []) as unknown as {
    members: number | string;
    clubs: number | string;
    sessions_held: number | string;
    books_funded: number | null;
  }[])[0];
  if (!row) return null;
  return {
    members: Number(row.members),
    clubs: Number(row.clubs),
    sessionsHeld: Number(row.sessions_held),
    booksFunded: Number(row.books_funded ?? 0),
  };
}
