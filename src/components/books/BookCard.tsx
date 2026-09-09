import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatLkrCents, priceLine } from "@/lib/pricing";
import type { LegacyBook } from "@/lib/legacy/types";

/**
 * A catalogue book with the member price worked out.
 *
 * The discount is passed in rather than read here, because it comes from
 * app_settings and one page renders forty of these -- looking it up per card
 * would be forty round trips.
 */
export function BookCard({
  book,
  discountPercent,
  href,
  hidePrice = false,
  actions,
}: {
  book: LegacyBook;
  discountPercent: number;
  href: string;
  /** The borrowing catalogue shows no price -- there is nothing to pay. */
  hidePrice?: boolean;
  /**
   * Buttons rendered BELOW the link, never inside it.
   *
   * A <button> nested in an <a> is invalid HTML, and in practice the tap
   * navigates instead of acting. So the Link covers the cover and the title,
   * and these sit outside it -- which is also why `interactive` is dropped
   * once there are actions: the card stops being a single target, and a hover
   * lift would promise a click that does nothing.
   */
  actions?: ReactNode;
}) {
  const { listCents, memberCents, savedCents } = priceLine(book.priceLkr, discountPercent);
  const discounted = savedCents > 0;

  return (
    <Card
      flush
      interactive={!actions}
      className="h-full overflow-hidden flex flex-col"
    >
      <Link href={href} className="block flex-1 flex flex-col">
        <div className="relative aspect-3/4 bg-canvas">
          {book.imageUrl ? (
            /*
              A plain <img>, not next/image. The legacy `image` column points at
              hosts we cannot enumerate ahead of time, and next/image hard-errors
              on any host missing from remotePatterns. Some of these files are
              also long gone, hence the onError fallback.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-ink-faint text-xs px-2 text-center">
              No cover
            </div>
          )}

          {!book.inStock ? (
            <Badge tone="warning" className="absolute top-2 left-2 shadow-card">
              Pre-order
            </Badge>
          ) : null}
        </div>

        <div className="p-3 flex-1 flex flex-col">
          <p className="text-sm font-medium text-ink line-clamp-2">{book.title}</p>
          {book.author ? (
            <p className="text-xs text-ink-muted mt-0.5 line-clamp-1">{book.author}</p>
          ) : null}

          <div className="mt-auto pt-2">
            {hidePrice ? null : discounted ? (
              <>
                <p className="text-sm font-semibold text-brand-600">
                  {formatLkrCents(memberCents)}
                </p>
                <p className="text-xs text-ink-faint">
                  <span className="line-through">{formatLkrCents(listCents)}</span>{" "}
                  <span className="text-success-600">
                    save {formatLkrCents(savedCents)}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-ink">{formatLkrCents(listCents)}</p>
            )}
          </div>
        </div>
      </Link>

      {actions ? (
        <div className="px-3 pb-3 pt-0 flex flex-wrap items-start gap-1.5">{actions}</div>
      ) : null}
    </Card>
  );
}
