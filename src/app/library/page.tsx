import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookCard } from "@/components/books/BookCard";
import { CatalogueFilters, CataloguePager } from "@/components/books/CatalogueFilters";
import { CatalogueUnavailable } from "@/components/books/CatalogueUnavailable";
import { requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { listBooks, listCategories } from "@/lib/legacy/books";
import type { BookQuery } from "@/lib/legacy/types";

export const metadata: Metadata = { title: "Library" };
export const revalidate = 60;

type Search = { q?: string; category?: string; language?: string; page?: string };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const member = await requireActiveMember();
  const sp = await searchParams;

  const query: BookQuery = {
    search: sp.q,
    category: sp.category,
    language: sp.language === "tamil" || sp.language === "sinhala" ? sp.language : undefined,
    // The whole point of this page: only what can actually be borrowed.
    lendableOnly: true,
    page: Number(sp.page) || 1,
  };

  const [result, categoriesResult] = await Promise.all([listBooks(query), listCategories()]);
  const categories = categoriesResult.ok ? categoriesResult.data : [];

  return (
    <AppShell
      member={{
        firstName: member.firstName,
        lastName: member.lastName,
        avatarUrl: avatarUrl(member.userId, member.avatarPath),
      }}
    >
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-ink">Library</h1>
        <p className="text-sm text-ink-muted">
          Books you can borrow rather than buy.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CatalogueFilters
            action="/library"
            categories={categories}
            current={{ search: sp.q, category: sp.category, language: sp.language }}
            showAvailability={false}
          />
        </Card>

        {!result.ok ? (
          <CatalogueUnavailable reason={result.reason} />
        ) : result.data.books.length === 0 ? (
          <Card flush>
            <EmptyState
              title="Nothing in the library matches that"
              description="Try a different search, or clear the filters."
            />
          </Card>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              {result.data.total.toLocaleString("en-LK")} book
              {result.data.total === 1 ? "" : "s"} available to borrow
              {result.data.pages > 1 ? ` · page ${result.data.page} of ${result.data.pages}` : ""}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {result.data.books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  // Borrowing has no price, so no discount to show.
                  discountPercent={0}
                  href={`/books/${book.id}`}
                />
              ))}
            </div>

            <CataloguePager
              basePath="/library"
              params={{ q: sp.q, category: sp.category, language: sp.language }}
              page={result.data.page}
              pages={result.data.pages}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
