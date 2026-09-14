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
 * thing to show someone who just gave money — the exact opposite of what this
 * card is for.
 *
 * The bar carries three NESTED figures, not three separate ones: what the
 * member gave is part of what their club gave, which is part of the total. So
 * they are drawn as segments of one bar, widest first, each starting where the
 * last ends. Three separate bars would invite the reader to add them up and
 * get a number three times too big.
 */
export function ReadRiseCard({ totals }: { totals: ReadRiseTotals }) {
  const perBook =
    totals.myBooks > 0 ? totals.myDonated / totals.myBooks : null;

  const toNextBook =
    perBook != null ? perBook * (totals.myBooks + 1) - totals.myDonated : null;

  // Everything is a percentage of the TARGET, so the three segments sit on one
  // scale and the widest is genuinely the whole movement.
  const pctOf = (books: number) =>
    totals.targetBooks > 0
      ? Math.min(100, (books / totals.targetBooks) * 100)
      : 0;

  const allPct = pctOf(totals.booksFunded);
  const clubPct = pctOf(totals.clubBooks);
  const minePct = pctOf(totals.myBooks);

  // A campaign at a fraction of a percent still needs a visible sliver, or the
  // bar renders empty and reads as a broken component rather than early days.
  const show = (p: number) => (p > 0 ? Math.max(p, 0.8) : 0);

  const targetYear = new Date(`${totals.targetOn}T00:00:00`).getFullYear();

  const LEGEND = [
    { label: "Everyone", value: totals.donatedLkr, className: "bg-brand-500" },
    {
      label: totals.clubName ?? "Your club",
      value: totals.clubDonated,
      className: "bg-sky-500",
      hide: totals.clubId == null,
    },
    { label: "You", value: totals.myDonated, className: "bg-gold-500" },
  ].filter((l) => !l.hide);

  return (
    <Card tone="brand">
      <div className="flex items-start justify-between gap-3">
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

        {/*
          Three segments, drawn widest first and stacked on top of each other
          rather than side by side, because the figures nest. `readrise-grow`
          animates the width from zero on load — a progress bar that is simply
          there has nothing to say; one that fills says "this is moving".
        */}
        <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface">
          <div
            className="readrise-grow absolute inset-y-0 left-0 rounded-full bg-brand-500"
            style={{ ["--w" as string]: `${show(allPct)}%` }}
          />
          {totals.clubId ? (
            <div
              className="readrise-grow absolute inset-y-0 left-0 rounded-full bg-sky-500"
              style={{
                ["--w" as string]: `${show(clubPct)}%`,
                animationDelay: "0.12s",
              }}
            />
          ) : null}
          <div
            className="readrise-grow absolute inset-y-0 left-0 rounded-full bg-gold-500"
            style={{
              ["--w" as string]: `${show(minePct)}%`,
              animationDelay: "0.24s",
            }}
          />
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className={`size-2.5 shrink-0 rounded-full ${item.className}`}
              />
              <span className="text-ink-muted">{item.label}</span>
              <span className="font-medium text-ink tabular-nums">
                {lkr(item.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/books"
        className="press mt-4 inline-flex min-h-9 items-center rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        {totals.myDonated > 0 ? "Give another book" : "Browse the catalogue"}
      </Link>
    </Card>
  );
}
