import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type WishlistKind = "borrow" | "buy";

export type WishlistItem = {
  id: string;
  bookId: number;
  kind: WishlistKind;
  title: string;
  author: string;
  createdAt: string;
};

export type BorrowStatus =
  | "requested"
  | "approved"
  | "issued"
  | "returned"
  | "rejected"
  | "cancelled";

export type BorrowRequest = {
  id: string;
  bookId: number;
  title: string;
  author: string;
  status: BorrowStatus;
  note: string | null;
  dueOn: string | null;
  requestedAt: string;
  returnedAt: string | null;
};

export type LibraryAccess = {
  /** Borrowing is paid for and in date. */
  active: boolean;
  /** When it runs out, or null if never bought. */
  expiresOn: string | null;
  /** Bought before but lapsed — worth saying differently from never having had it. */
  lapsed: boolean;
  feeLkr: number;
  termMonths: number;
};

/**
 * Whether this member may borrow, and what it costs if not.
 *
 * The expiry is read from the profile rather than through
 * `current_member_has_library()` so the page can also say WHEN it runs out —
 * but the decision itself is recomputed here with the same rule the RPC uses,
 * because a page that disagrees with the paywall is worse than no page.
 */
export async function getLibraryAccess(memberId: string): Promise<LibraryAccess> {
  const supabase = await getServerComponentSupabase();

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase
      .from("profiles")
      .select("library_expires_on")
      .eq("id", memberId)
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("library_addon_fee_lkr, library_addon_term_months")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const expiresOn = profile?.library_expires_on ?? null;

  // Compared as dates, not timestamps. `library_expires_on >= current_date` in
  // SQL means the whole of the expiry day still counts, and a `new Date()`
  // comparison would cut it off at midnight UTC — which for Colombo is 5.30am,
  // so a member would lose their last day before breakfast.
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const active = expiresOn != null && expiresOn >= todayKey;

  return {
    active,
    expiresOn,
    lapsed: expiresOn != null && !active,
    feeLkr: Number(settings?.library_addon_fee_lkr ?? 6000),
    termMonths: Number(settings?.library_addon_term_months ?? 12),
  };
}

export async function getWishlist(kind: WishlistKind): Promise<WishlistItem[]> {
  const supabase = await getServerComponentSupabase();

  // No member filter: the policy on book_wishlist is `member_id = auth.uid()`
  // for every command, so this cannot return anyone else's rows. Adding a
  // filter here would imply the policy might not hold.
  const { data } = await supabase
    .from("book_wishlist")
    .select("id, book_id, kind, title, author, created_at")
    .eq("kind", kind)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as {
    id: string;
    book_id: number;
    kind: string;
    title: string;
    author: string;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    bookId: Number(r.book_id),
    kind: r.kind as WishlistKind,
    title: r.title,
    author: r.author,
    createdAt: r.created_at,
  }));
}

/** The book ids already on a member's lists, for showing buttons as "added". */
export async function getWishlistedIds(): Promise<Record<WishlistKind, Set<number>>> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.from("book_wishlist").select("book_id, kind");

  const out: Record<WishlistKind, Set<number>> = {
    borrow: new Set(),
    buy: new Set(),
  };
  for (const row of (data ?? []) as unknown as { book_id: number; kind: string }[]) {
    const kind = row.kind === "buy" ? "buy" : "borrow";
    out[kind].add(Number(row.book_id));
  }
  return out;
}

export async function getMyBorrowRequests(): Promise<BorrowRequest[]> {
  const supabase = await getServerComponentSupabase();

  const { data } = await supabase
    .from("borrow_requests")
    .select("id, book_id, title, author, status, note, due_on, requested_at, returned_at")
    .order("requested_at", { ascending: false });

  return toBorrowRequests(data);
}

/** Book ids with a request still in flight, so the catalogue can say so. */
export async function getOpenBorrowBookIds(): Promise<Set<number>> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("borrow_requests")
    .select("book_id, status")
    .in("status", ["requested", "approved", "issued"]);

  return new Set(
    ((data ?? []) as unknown as { book_id: number }[]).map((r) => Number(r.book_id)),
  );
}

type RawBorrow = {
  id: string;
  book_id: number;
  title: string;
  author: string;
  status: string;
  note: string | null;
  due_on: string | null;
  requested_at: string;
  returned_at: string | null;
};

function toBorrowRequests(data: unknown): BorrowRequest[] {
  return ((data ?? []) as RawBorrow[]).map((r) => ({
    id: r.id,
    bookId: Number(r.book_id),
    title: r.title,
    author: r.author,
    status: r.status as BorrowStatus,
    note: r.note,
    dueOn: r.due_on,
    requestedAt: r.requested_at,
    returnedAt: r.returned_at,
  }));
}

export type AdminBorrowRequest = BorrowRequest & {
  member: { id: string; firstName: string; lastName: string; email: string } | null;
};

/**
 * Every borrow request, for the admin queue.
 *
 * RLS gives admins every row, so there is no filter here for the same reason
 * as the directory: if this ever shows a non-admin someone else's request, the
 * bug is in the policy and should be fixed there.
 */
export async function getAllBorrowRequests(): Promise<AdminBorrowRequest[]> {
  const supabase = await getServerComponentSupabase();

  const { data } = await supabase
    .from("borrow_requests")
    .select(
      `id, book_id, title, author, status, note, due_on, requested_at, returned_at,
       profiles ( id, first_name, last_name, email )`,
    )
    .order("requested_at", { ascending: false });

  type Row = RawBorrow & {
    profiles: { id: string; first_name: string; last_name: string; email: string } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...toBorrowRequests([r])[0],
    member: r.profiles
      ? {
          id: r.profiles.id,
          firstName: r.profiles.first_name,
          lastName: r.profiles.last_name,
          email: r.profiles.email,
        }
      : null,
  }));
}
