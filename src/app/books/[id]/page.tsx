import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card, CardHeader } from "@/components/ui/Card";
import { CatalogueUnavailable } from "@/components/books/CatalogueUnavailable";
import { BorrowButton, WishlistButton } from "@/components/books/BookActions";
import { AddToCartButton } from "@/app/cart/CartClient";
import { requireActiveMember } from "@/lib/auth/session";
import {
  getLibraryAccess,
  getOpenBorrowBookIds,
  getWishlistedIds,
} from "@/lib/library/queries";
import { getCartBookIds } from "@/lib/orders/queries";
import { getBook } from "@/lib/legacy/books";
import { isStoreBookId } from "@/lib/store/books";
import { getBuyableBook } from "@/lib/shop/catalogue";
import { getShelfBook, isShelfBookId } from "@/lib/library/shelf";
import { getClubAuthorBook, isAuthorBookId } from "@/lib/creators/shop";
import { formatLkrCents, priceLine, toCents } from "@/lib/pricing";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

// Was `revalidate = 300`. The page now shows per-member state -- what this
// member has wishlisted, and whether they already asked to borrow it -- and a
// shared cache would hand one member another's buttons.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (isAuthorBookId(Number(id))) {
    const book = await getClubAuthorBook(Number(id));
    return { title: book ? book.title : "Book" };
  }
  if (isShelfBookId(Number(id))) {
    const book = await getShelfBook(Number(id));
    return { title: book ? book.title : "Book" };
  }
  const result = await getBuyableBook(Number(id));
  return { title: result.ok && result.data ? result.data.title : "Book" };
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const member = await requireActiveMember();
  const { id } = await params;

  const bookId = Number(id);
  if (!Number.isFinite(bookId) || bookId <= 0) notFound();

  const supabase = await getServerComponentSupabase();
  const [{ data: settings }, result, wishlisted, openBorrows, access, cartIds] =
    await Promise.all([
    supabase.from("app_settings").select("book_discount_percent").eq("id", 1).maybeSingle(),
    isShelfBookId(bookId)
      ? // The club's own shelf: lendable, never for sale, and priced at
        // nothing so the buying half of this page stays quiet.
        getShelfBook(bookId).then((shelf) => ({
          ok: true as const,
          data: shelf
            ? {
                id: shelf.id,
                title: shelf.title,
                author: shelf.author,
                bookBy: "",
                priceLkr: "0",
                description: shelf.description,
                isbn: shelf.isbn,
                edition: null,
                imageUrl: shelf.coverUrl,
                categoryLabel: shelf.category,
                inStock: shelf.available > 0,
                lendable: shelf.isActive,
              }
            : null,
        }))
      : isAuthorBookId(bookId)
        ? getClubAuthorBook(bookId).then((data) => ({ ok: true as const, data }))
        : isStoreBookId(bookId)
          ? getBuyableBook(bookId)
          : // Not ours and not the store's: the old catalogue, which is where
            // every past order's book still lives.
            getBook(bookId),
    getWishlistedIds(),
    getOpenBorrowBookIds(),
    getLibraryAccess(member.userId),
    getCartBookIds(),
  ]);

  const discount = Number(settings?.book_discount_percent ?? 0);

  if (!result.ok) {
    return (
      <AppShell allowStaff>
        <div className="mb-4">
          <BackLink href="/books">Books</BackLink>
        </div>
        <CatalogueUnavailable reason={result.reason} />
      </AppShell>
    );
  }

  const book = result.data;
  if (!book) notFound();

  // A store book carries the price the store itself advertises. Members pay
  // the club's price, which is lower again, so both are shown: one is what
  // they pay, the other is what it is worth.
  const fromShelf = isShelfBookId(bookId);
  const fromStore = isStoreBookId(bookId);
  const marketPrice =
    fromStore && "marketPriceLkr" in book
      ? ((book as { marketPriceLkr: string | null }).marketPriceLkr ?? null)
      : null;
  const soldOut = fromStore && !book.inStock;

  const { listCents, memberCents, savedCents } = priceLine(book.priceLkr, discount);

  return (
    <AppShell allowStaff>
      <div className="mb-4">
        <BackLink href="/books">Books</BackLink>
      </div>

      <div className="grid sm:grid-cols-[220px_1fr] gap-4">
        <Card flush className="overflow-hidden h-fit">
          <div className="relative aspect-3/4 bg-canvas">
            {book.imageUrl ? (
              // Plain <img> — the legacy image column points at hosts we cannot
              // enumerate, and next/image hard-errors on unknown hosts.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-ink-faint text-sm">
                No cover
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h1 className="font-display text-2xl text-ink">{book.title}</h1>
            {book.author ? <p className="text-sm text-ink-muted mt-0.5">{book.author}</p> : null}

            <div className="mt-4">
              {fromShelf ? (
                <p className="text-sm font-medium text-brand-600">
                  On the club&apos;s shelf
                </p>
              ) : savedCents > 0 ? (
                <>
                  <p className="text-2xl font-semibold text-brand-600">
                    {formatLkrCents(memberCents)}
                  </p>
                  <p className="text-sm text-ink-muted">
                    <span className="line-through">{formatLkrCents(listCents)}</span>{" "}
                    <span className="text-success-600 font-medium">
                      you save {formatLkrCents(savedCents)}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-3xl font-semibold text-ink">{formatLkrCents(listCents)}</p>
              )}

              {marketPrice && Number(marketPrice) > Number(book.priceLkr) ? (
                <p className="mt-1 text-xs text-ink-faint">
                  Market price {formatLkrCents(toCents(marketPrice))}
                </p>
              ) : null}

              <p className="text-sm mt-2">
                {fromShelf ? (
                  book.inStock ? (
                    <span className="text-success-600 font-medium">
                      A copy is on the shelf
                    </span>
                  ) : (
                    <span className="text-ink-muted font-medium">
                      Every copy is out at the moment
                    </span>
                  )
                ) : book.inStock ? (
                  <span className="text-success-600 font-medium">In stock</span>
                ) : soldOut ? (
                  <span className="text-ink-muted font-medium">
                    Sold out — ask the club and they will tell you when it is back
                  </span>
                ) : (
                  <span className="text-warning-600 font-medium">
                    Pre-order — the club orders it in for you
                  </span>
                )}
                {book.lendable ? (
                  <span className="text-ink-muted"> · also in the lending library</span>
                ) : null}
              </p>
            </div>

            {/*
              Borrow only appears when the book is genuinely lendable AND the
              member has the add-on. Showing a Borrow button that then errors
              would advertise the add-on by frustrating people, which is a poor
              way to sell it -- the pitch lives on /library instead.
            */}
            <div className="mt-4 flex flex-wrap items-start gap-2">
              {/* Nothing on the club's own shelf is for sale, so the buying
                  half of this page stays out of the way for those books. */}
              {fromShelf ? null : (
                <>
                  <AddToCartButton
                    book={{ id: book.id, title: book.title, author: book.author }}
                    inCart={cartIds.has(book.id)}
                    soldOut={soldOut}
                  />
                  <WishlistButton
                    book={{ id: book.id, title: book.title, author: book.author }}
                    kind="buy"
                    saved={wishlisted.buy.has(book.id)}
                    labels={{ add: "Save to buy", added: "Saved to buy" }}
                  />
                </>
              )}

              {book.lendable && access.active ? (
                <>
                  <BorrowButton
                    book={{ id: book.id, title: book.title, author: book.author }}
                    alreadyOpen={openBorrows.has(book.id)}
                    unavailable={fromShelf && !book.inStock}
                  />
                  <WishlistButton
                    book={{ id: book.id, title: book.title, author: book.author }}
                    kind="borrow"
                    saved={wishlisted.borrow.has(book.id)}
                    labels={{ add: "Borrow later", added: "Saved to borrow" }}
                  />
                </>
              ) : null}
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              {book.categoryLabel ? (
                <div className="flex gap-2">
                  <dt className="text-ink-faint w-20 shrink-0">Category</dt>
                  <dd className="text-ink">{book.categoryLabel}</dd>
                </div>
              ) : null}
              {book.isbn ? (
                <div className="flex gap-2">
                  <dt className="text-ink-faint w-20 shrink-0">ISBN</dt>
                  <dd className="text-ink">{book.isbn}</dd>
                </div>
              ) : null}
              {book.edition ? (
                <div className="flex gap-2">
                  <dt className="text-ink-faint w-20 shrink-0">Edition</dt>
                  <dd className="text-ink">{book.edition}</dd>
                </div>
              ) : null}
              {book.bookBy ? (
                <div className="flex gap-2">
                  <dt className="text-ink-faint w-20 shrink-0">Publisher</dt>
                  <dd className="text-ink">{book.bookBy}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {book.description ? (
            <Card>
              <CardHeader title="About this book" />
              <p className="text-sm text-ink whitespace-pre-line">{book.description}</p>
            </Card>
          ) : null}

          <Card>
            <p className="text-sm text-ink-muted">
              Buying and borrowing from inside the portal is coming next. For now,
              quote this book to the club and your member discount will be applied.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
