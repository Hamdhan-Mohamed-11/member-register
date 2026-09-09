import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { buttonClassName } from "@/components/ui/Button";
import { BookCard } from "@/components/books/BookCard";
import { BorrowButton, WishlistButton } from "@/components/books/BookActions";
import { CatalogueFilters, CataloguePager } from "@/components/books/CatalogueFilters";
import { CatalogueUnavailable } from "@/components/books/CatalogueUnavailable";
import { LibraryAddonButton } from "./LibraryAddonButton";
import { requireActiveMember } from "@/lib/auth/session";
import { listBooks, listCategories } from "@/lib/legacy/books";
import {
  getLibraryAccess,
  getOpenBorrowBookIds,
  getWishlistedIds,
} from "@/lib/library/queries";
import type { BookQuery } from "@/lib/legacy/types";

export const metadata: Metadata = { title: "Library" };

// Per-member state (what is wishlisted, what is already requested) is on this
// page, so it cannot be cached across members the way /books is.
export const dynamic = "force-dynamic";

type Search = { q?: string; category?: string; language?: string; page?: string };

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const member = await requireActiveMember();
  const sp = await searchParams;
  const access = await getLibraryAccess(member.userId);

  // The paywall. The catalogue is not fetched at all for a member without the
  // add-on -- not fetched-and-hidden, because a hidden list is still a list
  // that went over the wire.
  if (!access.active) {
    return (
      <AppShell>
        <PageHeader
          title="Borrow books"
          description="Borrowing is a separate add-on to your club membership."
        />

        <Card tone="brand">
          <CardHeader
            title={
              access.lapsed ? "Your borrowing has run out" : "Add borrowing to your membership"
            }
            description={
              access.lapsed && access.expiresOn
                ? `It ended on ${formatDate(access.expiresOn)}. Renew to start borrowing again.`
                : "Take books home from the Pick a Book library instead of buying them."
            }
          />

          <p className="font-display text-3xl text-brand-600">
            LKR {access.feeLkr.toLocaleString("en-LK")}
          </p>
          <p className="text-sm text-ink-muted mt-1">
            for {access.termMonths} months, renewed yearly
          </p>

          <ul className="mt-4 space-y-1.5 text-sm text-ink">
            <li>· Borrow from the lending catalogue</li>
            <li>· Keep a wishlist of what to borrow next</li>
            <li>· Up to three books out at a time</li>
          </ul>

          <div className="mt-5">
            <LibraryAddonButton isRenewal={access.lapsed} />
          </div>
        </Card>

        <p className="mt-4 text-sm text-ink-muted">
          Looking for books to buy instead?{" "}
          <Link href="/books" className="text-brand-600 hover:underline">
            Browse the catalogue
          </Link>
          .
        </p>
      </AppShell>
    );
  }

  const query: BookQuery = {
    search: sp.q,
    category: sp.category,
    language: sp.language === "tamil" || sp.language === "sinhala" ? sp.language : undefined,
    // The whole point of this page: only what can actually be borrowed.
    lendableOnly: true,
    page: Number(sp.page) || 1,
  };

  const [result, categoriesResult, wishlisted, openBorrows] = await Promise.all([
    listBooks(query),
    listCategories(),
    getWishlistedIds(),
    getOpenBorrowBookIds(),
  ]);
  const categories = categoriesResult.ok ? categoriesResult.data : [];

  return (
    <AppShell>
      <PageHeader
        title="Library"
        description="Books you can borrow rather than buy."
        action={
          <Link href="/me/borrowing" className={buttonClassName("secondary", "sm")}>
            My borrowing
          </Link>
        }
      />

      {access.expiresOn ? (
        <p className="-mt-2 mb-4">
          <Badge tone="success">Borrowing until {formatDate(access.expiresOn)}</Badge>
        </p>
      ) : null}

      <div className="space-y-4">
        <Card>
          <CatalogueFilters
            action="/library"
            categories={categories}
            current={{ search: sp.q, category: sp.category, language: sp.language }}
            showAvailability={false}
            showPrice={false}
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
                  discountPercent={0}
                  hidePrice
                  href={`/books/${book.id}`}
                  actions={
                    <>
                      <BorrowButton
                        book={{ id: book.id, title: book.title, author: book.author }}
                        alreadyOpen={openBorrows.has(book.id)}
                      />
                      <WishlistButton
                        book={{ id: book.id, title: book.title, author: book.author }}
                        kind="borrow"
                        saved={wishlisted.borrow.has(book.id)}
                        labels={{ add: "Later", added: "Saved" }}
                      />
                    </>
                  }
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
