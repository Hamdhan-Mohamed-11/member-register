import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type CartLine = {
  bookId: number;
  title: string;
  author: string;
  quantity: number;
};

export type OrderStatus =
  | "review"
  | "quoted"
  | "agreed"
  | "paid"
  | "declined"
  | "cancelled"
  | "fulfilled";

export type OrderItem = {
  id: string;
  bookId: number;
  title: string;
  author: string;
  quantity: number;
  /** What the member's session said it cost. Never charged; see migration 0025. */
  askingUnitPrice: number;
  /** What an admin confirmed. Null until reviewed. */
  agreedUnitPrice: number | null;
};

export type OrderMessage = {
  id: string;
  body: string;
  fromAdmin: boolean;
  createdAt: string;
};

export type BookOrder = {
  id: string;
  status: OrderStatus;
  askingTotal: number;
  agreedTotal: number | null;
  readriseLkr: number;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  memberName: string | null;
  memberEmail: string | null;
  memberId: string | null;
  items: OrderItem[];
  messages: OrderMessage[];
};

const ORDER_SELECT = `
  id, status, asking_total_lkr, agreed_total_lkr, readrise_lkr, note,
  created_at, reviewed_at, member_name, member_email, member_id,
  book_order_items ( id, book_id, title, author, quantity,
                     asking_unit_price_lkr, agreed_unit_price_lkr ),
  book_order_messages ( id, body, from_admin, created_at )
`;

type RawOrder = {
  id: string;
  status: string;
  asking_total_lkr: number | string;
  agreed_total_lkr: number | string | null;
  readrise_lkr: number | string;
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
  member_name: string | null;
  member_email: string | null;
  member_id: string | null;
  book_order_items: {
    id: string;
    book_id: number;
    title: string;
    author: string;
    quantity: number;
    asking_unit_price_lkr: number | string;
    agreed_unit_price_lkr: number | string | null;
  }[] | null;
  book_order_messages: {
    id: string;
    body: string;
    from_admin: boolean;
    created_at: string;
  }[] | null;
};

function toOrder(raw: RawOrder): BookOrder {
  return {
    id: raw.id,
    status: raw.status as OrderStatus,
    askingTotal: Number(raw.asking_total_lkr),
    agreedTotal: raw.agreed_total_lkr == null ? null : Number(raw.agreed_total_lkr),
    readriseLkr: Number(raw.readrise_lkr),
    note: raw.note,
    createdAt: raw.created_at,
    reviewedAt: raw.reviewed_at,
    memberName: raw.member_name,
    memberEmail: raw.member_email,
    memberId: raw.member_id,
    items: (raw.book_order_items ?? []).map((i) => ({
      id: i.id,
      bookId: Number(i.book_id),
      title: i.title,
      author: i.author,
      quantity: i.quantity,
      askingUnitPrice: Number(i.asking_unit_price_lkr),
      agreedUnitPrice:
        i.agreed_unit_price_lkr == null ? null : Number(i.agreed_unit_price_lkr),
    })),
    messages: (raw.book_order_messages ?? [])
      .map((m) => ({
        id: m.id,
        body: m.body,
        fromAdmin: m.from_admin,
        createdAt: m.created_at,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export async function getCart(): Promise<CartLine[]> {
  const supabase = await getServerComponentSupabase();
  // No member filter -- the policy on cart_items is auth.uid() for every
  // command, so this cannot return anyone else's basket.
  const { data } = await supabase
    .from("cart_items")
    .select("book_id, title, author, quantity")
    .order("added_at");

  return ((data ?? []) as unknown as {
    book_id: number;
    title: string;
    author: string;
    quantity: number;
  }[]).map((r) => ({
    bookId: Number(r.book_id),
    title: r.title,
    author: r.author,
    quantity: r.quantity,
  }));
}

/** Book ids already in the basket, so the catalogue can say "In basket". */
export async function getCartBookIds(): Promise<Set<number>> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.from("cart_items").select("book_id");
  return new Set(
    ((data ?? []) as unknown as { book_id: number }[]).map((r) => Number(r.book_id)),
  );
}

export async function getMyOrders(): Promise<BookOrder[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("book_orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as RawOrder[]).map(toOrder);
}

/**
 * One order.
 *
 * Returns null when RLS withheld it, which covers both "no such order" and
 * "not yours" -- the caller should treat that as notFound() rather than as a
 * permission error, for the same reason /members/[id] does.
 */
export async function getOrder(id: string): Promise<BookOrder | null> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("book_orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();

  return data ? toOrder(data as unknown as RawOrder) : null;
}

/** Every order, for the admin queue. RLS gives admins all rows. */
export async function getAllOrders(): Promise<BookOrder[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("book_orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as RawOrder[]).map(toOrder);
}

export type ReadRiseTotals = {
  booksFunded: number;
  donatedLkr: number;
  targetBooks: number;
  targetOn: string;
  myBooks: number;
  myDonated: number;
};

/**
 * The Read and Rise figures for the home page.
 *
 * Club-wide and personal in one call, because the card shows both and two
 * round trips for six numbers is silly.
 */
export async function getReadRiseTotals(): Promise<ReadRiseTotals | null> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.rpc("readrise_totals");

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        books_funded: number;
        donated_lkr: number | string;
        target_books: number;
        target_on: string;
        my_books: number;
        my_donated: number | string;
      }
    | undefined;

  if (!row) return null;

  return {
    booksFunded: Number(row.books_funded),
    donatedLkr: Number(row.donated_lkr),
    targetBooks: Number(row.target_books),
    targetOn: row.target_on,
    myBooks: Number(row.my_books),
    myDonated: Number(row.my_donated),
  };
}
