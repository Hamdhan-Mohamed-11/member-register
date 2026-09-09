import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { ReadRiseTotals } from "@/lib/orders/queries";

const lkr = (n: number) =>
  `LKR ${n.toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;

/**
 * What this member has put into Read and Rise, and where the club is up to.
 *
 * Leads with RUPEES, not books. A member who has just donated Rs. 200 against
 * a Rs. 500 book has funded nought books, and "0 books funded" is a deflating
 * thing to show someone who just gave money -- the exact opposite of what this
 * card is for. The rupee figure is always non-zero once they have bought
 * anything, and the books figure appears alongside it as it earns its place.
 *
 * The nudge is the gap to the next book, because that is a target a member can
 * actually close today.
 */
export function ReadRiseCard({ totals }: { totals: ReadRiseTotals }) {
  const perBook =
    totals.myBooks > 0 ? totals.myDonated / totals.myBooks : null;

  // How much more would fund one more book, derived from the same ratio the
  // database used rather than a second copy of the cost setting.
  const toNextBook =
    perBook != null
      ? perBook * (totals.myBooks + 1) - totals.myDonated
      : null;

  const pct =
    totals.targetBooks > 0
      ? Math.min(100, (totals.booksFunded / totals.targetBooks) * 100)
      : 0;

  const targetYear = new Date(`${totals.targetOn}T00:00:00`).getFullYear();

  return (
    <Card tone="brand">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
            Read and Rise
          </p>
          <h2 className="font-display text-lg text-ink leading-tight mt-0.5">
            {totals.myDonated > 0
              ? "Books you've put into schools"
              : "Every book you buy sends one to a school"}
          </h2>
        </div>
        <span aria-hidden className="text-2xl shrink-0">
          📚
        </span>
      </div>

      {totals.myDonated > 0 ? (
        <>
          <p className="mt-3 font-display text-3xl text-brand-600 tabular-nums">
            {lkr(totals.myDonated)}
          </p>
          <p className="text-sm text-ink-muted">
            given so far
            {totals.myBooks > 0
              ? ` — that's ${totals.myBooks} book${totals.myBooks === 1 ? "" : "s"} on a shelf somewhere`
              : ""}
          </p>

          {toNextBook != null && toNextBook > 0 ? (
            <p className="mt-2 text-sm text-ink">
              <span className="font-medium">{lkr(Math.ceil(toNextBook))}</span> more
              funds another one.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-ink">
          A share of every book you buy through the club goes to Read and Rise,
          which puts books into Sri Lankan schools. Nothing extra to pay.
        </p>
      )}

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs text-ink-muted">
          <span>
            {totals.booksFunded.toLocaleString("en-LK")} of{" "}
            {totals.targetBooks.toLocaleString("en-LK")} books by {targetYear}
          </span>
          <span className="tabular-nums">{pct.toFixed(pct < 1 ? 2 : 0)}%</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-600"
            // A campaign at 0.02% still deserves a visible sliver -- a bar that
            // renders as empty reads as a broken component, not as early days.
            style={{ width: `${Math.max(pct, 1.5)}%` }}
          />
        </div>
      </div>

      <Link
        href="/books"
        className="mt-4 inline-flex min-h-9 items-center rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        {totals.myDonated > 0 ? "Give another book" : "Browse the catalogue"}
      </Link>
    </Card>
  );
}
