import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { controlClassName } from "@/components/ui/Field";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { ShopBookRow, type ShopBookItem } from "./ShopBookRow";

export const metadata: Metadata = { title: "Shop books" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type Search = { q?: string; filter?: string; page?: string };

type Row = {
  id: number;
  store_id: number;
  title: string;
  author: string;
  isbn: string | null;
  category: string | null;
  description: string | null;
  price_lkr: number | string;
  store_price_lkr: number | string;
  price_is_ours: boolean;
  stock: number;
  cover_url: string | null;
  cover_is_ours: boolean;
  edited_at: string | null;
};

export default async function ShopBooksPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const admin = await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = sp.filter === "no-cover" || sp.filter === "ours" ? sp.filter : "all";

  const supabase = await getServerComponentSupabase();
  let query = supabase
    .from("shop_books")
    .select(
      "id, store_id, title, author, isbn, category, description, price_lkr, store_price_lkr, price_is_ours, stock, cover_url, cover_is_ours, edited_at",
      { count: "exact" },
    )
    .eq("is_active", true);

  // The useful view by far: the books with nothing to show. Those are the
  // ones somebody has to sit down and find pictures for.
  if (filter === "no-cover") query = query.is("cover_url", null);
  if (filter === "ours") query = query.eq("cover_is_ours", true);

  const search = sp.q?.trim();
  if (search) {
    const safe = search.replace(/[%,()]/g, " ").trim();
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%,isbn.ilike.%${safe}%`);
    }
  }

  const from = (page - 1) * PER_PAGE;
  const { data, count, error } = await query
    .order("sort_rank", { ascending: false })
    .order("store_id", { ascending: false })
    .range(from, from + PER_PAGE - 1);

  const books: ShopBookItem[] = ((data ?? []) as unknown as Row[]).map((b) => ({
    id: Number(b.id),
    storeId: Number(b.store_id),
    title: b.title,
    author: b.author ?? "",
    isbn: b.isbn,
    category: b.category,
    description: b.description,
    priceLkr: String(b.price_lkr),
    storePriceLkr: String(b.store_price_lkr),
    priceIsOurs: Boolean(b.price_is_ours),
    stock: Number(b.stock),
    coverUrl: b.cover_url,
    coverIsOurs: Boolean(b.cover_is_ours),
    editedAt: b.edited_at,
  }));

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const link = (p: number) =>
    `/admin/shop/books?${new URLSearchParams({
      ...(sp.q ? { q: sp.q } : {}),
      ...(filter !== "all" ? { filter } : {}),
      page: String(p),
    })}`;

  return (
    <AdminShell>
      <div className="mb-4">
        <BackLink href="/admin/shop">Shop catalogue</BackLink>
        <h1 className="page-title mt-1 font-display text-2xl text-ink sm:text-3xl">
          Shop books
        </h1>
        <p className="text-sm text-ink-muted">
          The store&apos;s books as members see them. Supply a cover or better
          words for any of them — what you write here survives every sync.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-ink">
                Search
              </label>
              <input
                id="q"
                type="search"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Title, author or ISBN"
                className={controlClassName}
              />
            </div>
            <input type="hidden" name="filter" value={filter} />
            <button type="submit" className={buttonClassName("primary", "md")}>
              Search
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ["all", "All books"],
              ["no-cover", "Missing a cover"],
              ["ours", "Cover we supplied"],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={`/admin/shop/books?${new URLSearchParams({
                  ...(sp.q ? { q: sp.q } : {}),
                  ...(value !== "all" ? { filter: value } : {}),
                })}`}
                className={`press inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium ${
                  filter === value
                    ? "bg-brand-600 text-white"
                    : "border border-line-strong bg-surface text-ink-muted hover:bg-canvas"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </Card>

        <Card flush>
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <p className="text-sm font-medium text-ink">
              {total.toLocaleString("en-LK")} {total === 1 ? "book" : "books"}
              {filter === "no-cover" ? " with no cover" : ""}
            </p>
            {error ? (
              <p className="text-xs text-danger-600">{error.message}</p>
            ) : (
              <p className="text-xs text-ink-muted">
                Page {page} of {pages}
              </p>
            )}
          </div>

          {books.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-muted sm:px-5">
              Nothing here. {filter === "no-cover" ? "Every book has a cover." : ""}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {books.map((book) => (
                <ShopBookRow key={book.id} book={book} userId={admin.userId} />
              ))}
            </ul>
          )}
        </Card>

        {pages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {page > 1 ? (
              <Link href={link(page - 1)} className={buttonClassName("secondary", "sm")}>
                Previous
              </Link>
            ) : (
              <span />
            )}
            {page < pages ? (
              <Link href={link(page + 1)} className={buttonClassName("secondary", "sm")}>
                Next
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
