import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreatorShell } from "@/components/creator/CreatorShell";
import { Card, CardHeader, Stat } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Field";
import { buttonClassName } from "@/components/ui/Button";
import { getSessionMember, isCreator } from "@/lib/auth/session";
import {
  getCreatorAccount,
  getMySales,
  listMyBooks,
  type BookStatus,
} from "@/lib/creators/queries";
import { bookCoverUrl } from "@/lib/creators/url";
import { formatLkrCents, toCents } from "@/lib/pricing";
import { WithdrawButton } from "./WithdrawButton";

export const metadata: Metadata = { title: "My books" };

const STATUS_LABEL: Record<BookStatus, string> = {
  pending: "Waiting for approval",
  approved: "On sale",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

const STATUS_CLASS: Record<BookStatus, string> = {
  pending: "bg-warning-100 text-warning-700",
  approved: "bg-success-100 text-success-700",
  rejected: "bg-danger-100 text-danger-700",
  withdrawn: "bg-canvas-deep text-ink-muted",
};

export default async function CreatorHome() {
  const session = await getSessionMember();
  if (!session) redirect("/login");
  // Anyone who is not yet a creator is sent to the form that makes them one,
  // rather than to an empty dashboard that cannot explain itself.
  if (!isCreator(session)) redirect("/creator/register");

  const [account, books, sales] = await Promise.all([
    getCreatorAccount(),
    listMyBooks(),
    getMySales(),
  ]);

  const salesByBook = new Map(sales.map((s) => [s.bookId, s]));
  const copies = sales.reduce((sum, s) => sum + s.copiesSold, 0);
  const revenueCents = sales.reduce((sum, s) => sum + toCents(s.revenueLkr), 0);
  const onSale = books.filter((b) => b.status === "approved").length;

  return (
    <CreatorShell>
      <div className="mb-4">
        <h1 className="page-title font-display text-2xl text-ink sm:text-3xl">
          {account?.name ?? "My books"}
        </h1>
        <p className="text-sm text-ink-muted">
          {account?.kind === "publisher"
            ? "Everything your authors have submitted, and what it has sold."
            : "Your books, and what they have sold through the club."}
        </p>
      </div>

      {account?.status === "pending" ? (
        <div className="mb-4">
          <Notice tone="info">
            Your account is with a Pick a Book admin. You can submit books now —
            they go on sale once your account and the book are both approved.
          </Notice>
        </div>
      ) : null}
      {account?.status === "rejected" ? (
        <div className="mb-4">
          <Notice>
            Your account wasn&apos;t approved.
            {account.declineReason ? ` ${account.declineReason}` : ""}
          </Notice>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <Stat label="On sale" value={String(onSale)} />
        </Card>
        <Card>
          <Stat label="Copies sold" value={String(copies)} />
        </Card>
        <Card>
          <Stat label="Sales" value={formatLkrCents(revenueCents)} />
        </Card>
      </div>

      <Card flush>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <CardHeader title="Books" description="Newest first." />
          <Link href="/creator/books/new" className={buttonClassName("secondary", "sm")}>
            Submit a book
          </Link>
        </div>

        {books.length === 0 ? (
          <EmptyState
            icon="book"
            title="No books yet"
            description="Submit your first one and a Pick a Book admin will review it."
            action={
              <Link href="/creator/books/new" className={buttonClassName("primary", "md")}>
                Submit a book
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {books.map((book) => {
              const sold = salesByBook.get(book.id);
              const cover = bookCoverUrl(book.coverPath);
              return (
                <li key={book.id} className="flex gap-3 px-4 py-3 sm:px-5">
                  <div className="grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-canvas-deep text-center text-[11px] text-ink-faint">
                    {cover ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-1">No cover</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{book.title}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[book.status]}`}
                      >
                        {STATUS_LABEL[book.status]}
                      </span>
                    </div>
                    <p className="text-sm text-ink-muted">
                      {book.authorName} · {formatLkrCents(toCents(book.priceLkr))}
                    </p>
                    {book.status === "rejected" && book.declineReason ? (
                      <p className="mt-1 text-sm text-danger-700">{book.declineReason}</p>
                    ) : null}
                    {sold && sold.copiesSold > 0 ? (
                      <p className="mt-1 text-sm text-ink">
                        {sold.copiesSold} sold ·{" "}
                        {formatLkrCents(toCents(sold.revenueLkr))}
                      </p>
                    ) : book.status === "approved" ? (
                      <p className="mt-1 text-sm text-ink-faint">No sales yet.</p>
                    ) : null}
                  </div>

                  {book.status === "approved" ? (
                    <WithdrawButton bookId={book.id} title={book.title} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </CreatorShell>
  );
}
