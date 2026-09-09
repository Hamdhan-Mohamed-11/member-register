import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookCard } from "@/components/books/BookCard";
import { CatalogueFilters, CataloguePager } from "@/components/books/CatalogueFilters";
import { CatalogueUnavailable } from "@/components/books/CatalogueUnavailable";
import { requireActiveMember } from "@/lib/auth/session";
import { listBooks, listCategories, memberPriceToShopPrice } from "@/lib/legacy/books";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import type { BookQuery } from "@/lib/legacy/types";

export const metadata: Metadata = { title: "Books" };

// The catalogue is a cache of someone else's database; a minute of staleness is
// fine and saves hammering HostGator on every page view.
export const revalidate = 60;

type Search = {
  q?: string;
  category?: string;
  language?: string;
  availability?: string;
  min_price?: string;
  max_price?: string;
  page?: string;
};

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireActiveMember();
  const sp = await searchParams;

  // The discount has to be known BEFORE the catalogue query, because the price
  // bounds a member types are member prices and the column holds shop prices.
  // That is why this is not in the Promise.all below with the other two.
  const supabase = await getServerComponentSupabase();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("book_discount_percent")
    .eq("id", 1)
    .maybeSingle();

  const discount = Number(settings?.book_discount_percent ?? 0);

  const asPrice = (raw: string | undefined): number | undefined => {
    const n = Number(raw);
    return raw && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const minMember = asPrice(sp.min_price);
  const maxMember = asPrice(sp.max_price);

  const query: BookQuery = {
    search: sp.q,
    category: sp.category,
    language: sp.language === "tamil" || sp.language === "sinhala" ? sp.language : undefined,
    availability:
      sp.availability === "in_stock" || sp.availability === "pre_order"
        ? sp.availability
        : undefined,
    minPriceLkr:
      minMember != null ? memberPriceToShopPrice(minMember, discount, "min") : undefined,
    maxPriceLkr:
      maxMember != null ? memberPriceToShopPrice(maxMember, discount, "max") : undefined,
    page: Number(sp.page) || 1,
  };

  const [result, categoriesResult] = await Promise.all([
    listBooks(query),
    listCategories(),
  ]);
  const categories = categoriesResult.ok ? categoriesResult.data : [];

  return (
    <AppShell>
      {/*
        The bottom bar has no room for /library, so this is the only link to
        it. Without it the borrowing catalogue is reachable only by typing the
        URL, which is how it went unnoticed.
      */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ink">Books</h1>
          <p className="text-sm text-ink-muted">
            {discount > 0
              ? `Members pay ${discount}% less than the shop price.`
              : "The Pick a Book catalogue."}
          </p>
        </div>
        <Link href="/library" className={`${buttonClassName("secondary", "sm")} shrink-0`}>
          Borrow a book
        </Link>
      </div>

      <div className="space-y-4">
        <Card>
          <CatalogueFilters
            action="/books"
            categories={categories}
            current={{
              search: sp.q,
              category: sp.category,
              language: sp.language,
              availability: sp.availability,
              minPrice: sp.min_price,
              maxPrice: sp.max_price,
            }}
          />
        </Card>

        {!result.ok ? (
          <CatalogueUnavailable reason={result.reason} />
        ) : result.data.books.length === 0 ? (
          <Card flush>
            <EmptyState
              title="No books match that"
              description="Try a different search, or clear the filters."
            />
          </Card>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              {result.data.total.toLocaleString("en-LK")} book
              {result.data.total === 1 ? "" : "s"}
              {result.data.pages > 1 ? ` · page ${result.data.page} of ${result.data.pages}` : ""}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {result.data.books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  discountPercent={discount}
                  href={`/books/${book.id}`}
                />
              ))}
            </div>

            <CataloguePager
              basePath="/books"
              params={{
                q: sp.q,
                category: sp.category,
                language: sp.language,
                availability: sp.availability,
                min_price: sp.min_price,
                max_price: sp.max_price,
              }}
              page={result.data.page}
              pages={result.data.pages}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
