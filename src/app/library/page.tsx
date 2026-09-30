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
import { CatalogueFilters } from "@/components/books/CatalogueFilters";
import { LibraryAddonButton } from "./LibraryAddonButton";
import { requireActiveMember } from "@/lib/auth/session";
import {
  getLibraryAccess,
  getOpenBorrowBookIds,
  getWishlistedIds,
} from "@/lib/library/queries";
import { listShelf, shelfCategories } from "@/lib/library/shelf";

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

  // The club's own shelf, not a shop catalogue. It is a few dozen books, so
  // it arrives in one query and is filtered in the database rather than paged.
  const [shelf, wishlisted, openBorrows] = await Promise.all([
    listShelf({ search: sp.q, category: sp.category }),
    getWishlistedIds(),
    getOpenBorrowBookIds(),
  ]);

  // Categories come from the whole shelf, not the filtered view: chips that
  // disappear as you use them make the filter feel broken.
  const all = sp.q || sp.category ? await listShelf() : shelf;
  const categories = shelfCategories(all);

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
            current={{ search: sp.q, category: sp.category }}
            showAvailability={false}
            showPrice={false}
            showLanguage={false}
          />
        </Card>

        {shelf.length === 0 ? (
          <Card flush>
            <EmptyState
              icon="book"
              title={
                all.length === 0
                  ? "The shelf is empty"
                  : "Nothing in the library matches that"
              }
              description={
                all.length === 0
                  ? "Books the club lends will appear here once an admin adds them."
                  : "Try a different search, or clear the filters."
              }
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {shelf.map((book) => (
                <BookCard
                  key={book.id}
                  book={{
                    id: book.id,
                    title: book.title,
                    author: book.author,
                    bookBy: "",
                    priceLkr: "0",
                    description: book.description,
                    isbn: book.isbn,
                    edition: null,
                    imageUrl: book.coverUrl,
                    categoryLabel: book.category,
                    // "In stock" on this page means a copy is on the shelf
                    // rather than out with somebody.
                    inStock: book.available > 0,
                    lendable: true,
                  }}
                  discountPercent={0}
                  hidePrice
                  outOfStockLabel="All out"
                  href={`/books/${book.id}`}
                  actions={
                    <>
                      <BorrowButton
                        book={{ id: book.id, title: book.title, author: book.author }}
                        alreadyOpen={openBorrows.has(book.id)}
                        unavailable={book.available <= 0}
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

            <p className="text-xs text-ink-muted">
              {shelf.length} {shelf.length === 1 ? "book" : "books"} on the shelf
              {all.length !== shelf.length ? ` of ${all.length}` : ""}.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
