import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type CreatorStatus = "pending" | "approved" | "rejected";
export type BookStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type CreatorAccount = {
  kind: "author" | "publisher";
  id: string;
  name: string;
  about: string | null;
  website: string | null;
  status: CreatorStatus;
  declineReason: string | null;
};

export type CreatorAuthor = {
  id: string;
  name: string;
  bio: string | null;
  status: CreatorStatus;
  declineReason: string | null;
  /** Whether this author signs in for themselves, or is on a publisher's list. */
  hasOwnLogin: boolean;
  publisherName: string | null;
  createdAt: string;
};

export type CreatorBook = {
  id: number;
  authorId: string;
  authorName: string;
  title: string;
  blurb: string | null;
  isbn: string | null;
  priceLkr: string;
  coverPath: string | null;
  status: BookStatus;
  declineReason: string | null;
  createdAt: string;
};

export type BookSales = {
  bookId: number;
  title: string;
  authorName: string;
  status: BookStatus;
  priceLkr: string;
  copiesSold: number;
  revenueLkr: string;
  lastSoldAt: string | null;
};

/**
 * Who the signed-in creator is, author or publisher.
 *
 * Returns null for anyone who is neither -- the pages using it are behind
 * requireCreator, so that null means "registered a moment ago and the role
 * landed before the row did", not "stranger".
 */
export async function getCreatorAccount(): Promise<CreatorAccount | null> {
  const supabase = await getServerComponentSupabase();

  // Addressed by id rather than by "the row I can see": every APPROVED author
  // is visible to every member -- their name is on a book in the shop -- so a
  // bare select here came back with the whole shelf and matched nobody.
  const [{ data: publisherId }, { data: authorId }] = await Promise.all([
    supabase.rpc("my_publisher_id"),
    supabase.rpc("my_author_id"),
  ]);

  const [{ data: publisher }, { data: author }] = await Promise.all([
    publisherId
      ? supabase
          .from("publishers")
          .select("id, name, about, website, status, decline_reason")
          .eq("id", publisherId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    authorId
      ? supabase
          .from("authors")
          .select("id, name, bio, status, decline_reason, owner_id")
          .eq("id", authorId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (publisher) {
    return {
      kind: "publisher",
      id: publisher.id,
      name: publisher.name,
      about: publisher.about,
      website: publisher.website,
      status: publisher.status as CreatorStatus,
      declineReason: publisher.decline_reason,
    };
  }
  if (author) {
    return {
      kind: "author",
      id: author.id,
      name: author.name,
      about: author.bio,
      website: null,
      status: author.status as CreatorStatus,
      declineReason: author.decline_reason,
    };
  }
  return null;
}

/**
 * The authors this account may submit books for.
 *
 * An author gets exactly themselves; a publisher gets its list. Both are read
 * through the same policy, so the shape of the answer is the difference, not
 * a branch in the caller.
 */
export async function listMyAuthors(): Promise<CreatorAuthor[]> {
  const supabase = await getServerComponentSupabase();
  const { data: publisherId } = await supabase.rpc("my_publisher_id");

  let query = supabase
    .from("authors")
    .select("id, name, bio, status, decline_reason, owner_id, created_at, publishers ( name )")
    .order("name");

  const { data: authorId } = await supabase.rpc("my_author_id");
  if (publisherId) query = query.eq("publisher_id", publisherId);
  else if (authorId) query = query.eq("id", authorId);
  else return [];

  const { data, error } = await query;
  if (error) console.error("[creators] authors:", error.message);

  type Row = {
    id: string;
    name: string;
    bio: string | null;
    status: string;
    decline_reason: string | null;
    owner_id: string | null;
    created_at: string;
    publishers: { name: string } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((a) => ({
    id: a.id,
    name: a.name,
    bio: a.bio,
    status: a.status as CreatorStatus,
    declineReason: a.decline_reason,
    hasOwnLogin: a.owner_id != null,
    publisherName: a.publishers?.name ?? null,
    createdAt: a.created_at,
  }));
}

/** Every book this account has submitted, whatever became of it. */
export async function listMyBooks(): Promise<CreatorBook[]> {
  const supabase = await getServerComponentSupabase();
  const { data: publisherId } = await supabase.rpc("my_publisher_id");
  const { data: authorId } = await supabase.rpc("my_author_id");

  let query = supabase
    .from("author_books")
    .select(
      "id, author_id, title, blurb, isbn, price_lkr, cover_path, status, decline_reason, created_at, authors ( name )",
    )
    .order("created_at", { ascending: false });

  if (publisherId) query = query.eq("publisher_id", publisherId);
  else if (authorId) query = query.eq("author_id", authorId);
  else return [];

  const { data, error } = await query;
  if (error) console.error("[creators] books:", error.message);

  type Row = {
    id: number;
    author_id: string;
    title: string;
    blurb: string | null;
    isbn: string | null;
    price_lkr: string;
    cover_path: string | null;
    status: string;
    decline_reason: string | null;
    created_at: string;
    authors: { name: string } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((b) => ({
    id: Number(b.id),
    authorId: b.author_id,
    authorName: b.authors?.name ?? "",
    title: b.title,
    blurb: b.blurb,
    isbn: b.isbn,
    priceLkr: String(b.price_lkr),
    coverPath: b.cover_path,
    status: b.status as BookStatus,
    declineReason: b.decline_reason,
    createdAt: b.created_at,
  }));
}

/** What each book has sold, from the orders the club actually filled. */
export async function getMySales(): Promise<BookSales[]> {
  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase.rpc("author_book_sales", { p_author_id: undefined });
  if (error) {
    console.error("[creators] sales:", error.message);
    return [];
  }

  type Row = {
    book_id: number;
    title: string;
    author_name: string;
    status: string;
    price_lkr: string;
    copies_sold: number;
    revenue_lkr: string;
    last_sold_at: string | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    bookId: Number(r.book_id),
    title: r.title,
    authorName: r.author_name,
    status: r.status as BookStatus,
    priceLkr: String(r.price_lkr),
    copiesSold: Number(r.copies_sold),
    revenueLkr: String(r.revenue_lkr),
    lastSoldAt: r.last_sold_at,
  }));
}

// --- the admin's queue -----------------------------------------------------

export type PendingCreator = {
  kind: "author" | "publisher";
  id: string;
  name: string;
  about: string | null;
  website: string | null;
  email: string | null;
  createdAt: string;
};

/**
 * Authors and publishers waiting for a decision.
 *
 * An author a publisher added is not here: the house was approved and its
 * list comes with it. Only self-registered names wait.
 */
export async function listPendingCreators(): Promise<PendingCreator[]> {
  const supabase = await getServerComponentSupabase();

  const [{ data: publishers }, { data: authors }] = await Promise.all([
    supabase
      .from("publishers")
      .select("id, name, about, website, created_at, profiles!publishers_owner_id_fkey ( email )")
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("authors")
      .select("id, name, bio, created_at, profiles!authors_owner_id_fkey ( email )")
      .eq("status", "pending")
      .order("created_at"),
  ]);

  type Row = {
    id: string;
    name: string;
    about?: string | null;
    bio?: string | null;
    website?: string | null;
    created_at: string;
    profiles: { email: string } | null;
  };

  const shape = (kind: "author" | "publisher") => (r: Row): PendingCreator => ({
    kind,
    id: r.id,
    name: r.name,
    about: r.about ?? r.bio ?? null,
    website: r.website ?? null,
    email: r.profiles?.email ?? null,
    createdAt: r.created_at,
  });

  return [
    ...((publishers ?? []) as unknown as Row[]).map(shape("publisher")),
    ...((authors ?? []) as unknown as Row[]).map(shape("author")),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type PendingBook = CreatorBook & { publisherName: string | null };

/** Books waiting to be let into the shop. */
export async function listPendingBooks(): Promise<PendingBook[]> {
  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase
    .from("author_books")
    .select(
      "id, author_id, title, blurb, isbn, price_lkr, cover_path, status, decline_reason, created_at, authors ( name ), publishers ( name )",
    )
    .eq("status", "pending")
    .order("created_at");

  if (error) console.error("[creators] pending books:", error.message);

  type Row = {
    id: number;
    author_id: string;
    title: string;
    blurb: string | null;
    isbn: string | null;
    price_lkr: string;
    cover_path: string | null;
    status: string;
    decline_reason: string | null;
    created_at: string;
    authors: { name: string } | null;
    publishers: { name: string } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((b) => ({
    id: Number(b.id),
    authorId: b.author_id,
    authorName: b.authors?.name ?? "",
    publisherName: b.publishers?.name ?? null,
    title: b.title,
    blurb: b.blurb,
    isbn: b.isbn,
    priceLkr: String(b.price_lkr),
    coverPath: b.cover_path,
    status: b.status as BookStatus,
    declineReason: b.decline_reason,
    createdAt: b.created_at,
  }));
}
