import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { CatalogueUnavailable } from "@/components/books/CatalogueUnavailable";
import { requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { getBook } from "@/lib/legacy/books";
import { formatLkrCents, priceLine } from "@/lib/pricing";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getBook(Number(id));
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
  const [{ data: settings }, result] = await Promise.all([
    supabase.from("app_settings").select("book_discount_percent").eq("id", 1).maybeSingle(),
    getBook(bookId),
  ]);

  const discount = Number(settings?.book_discount_percent ?? 0);

  const shell = {
    firstName: member.firstName,
    lastName: member.lastName,
    avatarUrl: avatarUrl(member.userId, member.avatarPath),
  };

  if (!result.ok) {
    return (
      <AppShell member={shell}>
        <div className="mb-4">
          <Link href="/books" className="text-sm text-brand-600 hover:underline">
            ← Books
          </Link>
        </div>
        <CatalogueUnavailable reason={result.reason} />
      </AppShell>
    );
  }

  const book = result.data;
  if (!book) notFound();

  const { listCents, memberCents, savedCents } = priceLine(book.priceLkr, discount);

  return (
    <AppShell member={shell}>
      <div className="mb-4">
        <Link href="/books" className="text-sm text-brand-600 hover:underline">
          ← Books
        </Link>
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
            <h1 className="text-xl font-semibold text-ink">{book.title}</h1>
            {book.author ? <p className="text-sm text-ink-muted mt-0.5">{book.author}</p> : null}

            <div className="mt-4">
              {savedCents > 0 ? (
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
                <p className="text-2xl font-semibold text-ink">{formatLkrCents(listCents)}</p>
              )}

              <p className="text-sm mt-2">
                {book.inStock ? (
                  <span className="text-success-600 font-medium">In stock</span>
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
