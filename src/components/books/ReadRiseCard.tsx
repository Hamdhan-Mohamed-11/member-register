import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { ReadRiseTotals } from "@/lib/orders/queries";

const lkr = (n: number) =>
  `LKR ${n.toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;

/**
 * What this member has put into Read and Rise, against what everyone has.
 *
 * Two figures, not three (review item 10): the member and the whole movement.
 * The club figure was dropped on review. Leads with RUPEES, not books, because
 * a member who has just given Rs. 200 against a Rs. 500 book has funded nought
 * books, and "0 books funded" is a deflating thing to show someone who gave.
 *
 * The two NEST -- what the member gave is part of everyone's total -- so they
 * are two segments of one bar, the member's drawn over the top of the whole,
 * rather than two bars a reader might add together.
 */
export function ReadRiseCard({ totals }: { totals: ReadRiseTotals }) {
  const perBook = totals.myBooks > 0 ? totals.myDonated / totals.myBooks : null;
  const toNextBook =
    perBook != null ? perBook * (totals.myBooks + 1) - totals.myDonated : null;

  const pctOf = (books: number) =>
    totals.targetBooks > 0 ? Math.min(100, (books / totals.targetBooks) * 100) : 0;

  const allPct = pctOf(totals.booksFunded);
  const minePct = pctOf(totals.myBooks);

  // A campaign at a fraction of a percent still needs a visible sliver, or the
  // bar renders empty and reads as broken rather than as early days.
  const show = (p: number) => (p > 0 ? Math.max(p, 0.8) : 0);
  const targetYear = new Date(`${totals.targetOn}T00:00:00`).getFullYear();

  return (
    <Card tone="brand" className="@container">
      {/* Title left, the call to action top right (review item 11) -- or
          stacked, when the card sits in a narrow side rail. A container query
          rather than a breakpoint: the same card is wide on one page and 320px
          on another at the same screen size. */}
      <div className="flex flex-col gap-3 @md:flex-row @md:items-start @md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
            Read and Rise
          </p>
          <h2 className="mt-0.5 font-display text-lg leading-tight text-ink">
            {totals.myDonated > 0
              ? "Books you've put into schools"
              : "Every book you buy sends one to a school"}
          </h2>
        </div>
        <Link
          href="/books"
          className="press inline-flex min-h-9 shrink-0 items-center self-start rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Donate another book
        </Link>
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
          <span className="tabular-nums">
            {allPct.toFixed(allPct > 0 && allPct < 1 ? 2 : 0)}%
          </span>
        </div>

        {/* Fills on load (`readrise-grow`); collapses under reduced motion. */}
        <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface">
          <div
            className="readrise-grow absolute inset-y-0 left-0 rounded-full bg-brand-500"
            style={{ ["--w" as string]: `${show(allPct)}%` }}
          />
          <div
            className="readrise-grow absolute inset-y-0 left-0 rounded-full bg-gold-500"
            style={{ ["--w" as string]: `${show(minePct)}%`, animationDelay: "0.18s" }}
          />
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {[
            { label: "Everyone", value: totals.donatedLkr, dot: "bg-brand-500" },
            { label: "You", value: totals.myDonated, dot: "bg-gold-500" },
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-xs">
              <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${item.dot}`} />
              <span className="text-ink-muted">{item.label}</span>
              <span className="font-medium text-ink tabular-nums">{lkr(item.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
