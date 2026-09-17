import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { sessionImageUrl } from "@/lib/flyers/url";
import type { SessionSummary } from "@/lib/sessions/queries";
import { CLUB_TZ } from "@/lib/time";

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: CLUB_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLkr(amount: number): string {
  return `LKR ${Number(amount).toLocaleString("en-LK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Just the time, for the line under the title where the date is already shown. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: CLUB_TZ,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * `fee` is what THIS viewer would pay -- resolved server-side per member, not
 * derived from the session. A host-club member sees "Free for your club" on
 * the very same session a guest is quoted a price for.
 */
export function SessionCard({
  session,
  fee,
  href,
}: {
  session: SessionSummary;
  fee?: number;
  href?: string;
}) {
  const when = new Date(session.heldAt);
  const cover = sessionImageUrl(session.imagePath);
  const past = when < new Date();
  const cancelled = session.status === "cancelled";

  const inner = (
    /*
      min-w-0 is load-bearing, not tidiness.

      This card is placed in a CSS grid on /feed and /sessions, and a grid item
      defaults to `min-width: auto` — it refuses to shrink below the intrinsic
      width of its content. Every `truncate` inside is then ignored and a long
      book title runs straight out of the card. Same rule applies to flex
      children, which is why the chain below repeats it.
    */
    <Card
      className={`h-full min-w-0 overflow-hidden ${past || cancelled ? "opacity-70" : ""}`}
      interactive={Boolean(href)}
      flush
    >
      {/* The cover the club uploaded, or a brand-coloured plate with the book
          on it -- a card with no picture at all in a grid of cards that have
          one looks broken, rather than plain. */}
      <div className="relative aspect-[16/7] w-full overflow-hidden bg-brand-900">
        {cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(420px 180px at 85% -20%, rgba(0,174,239,0.55), transparent 60%), linear-gradient(140deg, #16205c, #293896)",
              }}
            />
            <span className="absolute inset-0 flex flex-col justify-end p-3">
              <span className="line-clamp-2 font-display text-base leading-snug text-white [overflow-wrap:anywhere]">
                {session.bookTitle || session.title}
              </span>
              {session.bookAuthor ? (
                <span className="truncate text-xs text-sky-200">{session.bookAuthor}</span>
              ) : null}
            </span>
          </>
        )}

        {past || cancelled ? (
          <span className="absolute inset-0 bg-brand-950/45" aria-hidden />
        ) : null}
      </div>

      <div className="flex gap-4 p-4">
        {/*
          A date block rather than a line of text.

          A list of sessions is scanned by WHEN, not by title -- "is there
          anything this weekend" is the question being asked -- and a date
          buried in a grey line three rows down cannot answer it. Tinted for an
          upcoming session, flat for one that has been and gone, so the two
          separate at a glance without reading a word.
        */}
        <div
          className={`grid h-14 w-14 shrink-0 place-content-center rounded-card border text-center leading-none ${
            past || cancelled
              ? "border-line bg-canvas-deep text-ink-faint"
              : "border-sky-200 bg-sky-100 text-sky-800"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider">
            {when.toLocaleString("en-GB", { timeZone: CLUB_TZ, month: "short" })}
          </span>
          <span className="font-display text-xl tabular-nums">
            {when.toLocaleString("en-GB", { timeZone: CLUB_TZ, day: "numeric" })}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            {/* overflow-wrap:anywhere so a long unbroken word wraps instead
                of running under the badge; two lines at most. */}
            <p className="line-clamp-2 min-w-0 font-medium leading-snug text-ink [overflow-wrap:anywhere]">
              {session.title}
            </p>

            {cancelled ? (
              <Badge tone="danger" className="shrink-0">
                Cancelled
              </Badge>
            ) : fee === undefined ? null : fee === 0 ? (
              <Badge tone="success" className="shrink-0">
                Free
              </Badge>
            ) : (
              <Badge tone="warning" className="shrink-0">
                {formatLkr(fee)}
              </Badge>
            )}
          </div>

          {session.bookTitle ? (
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {session.bookTitle}
              {session.bookAuthor ? ` · ${session.bookAuthor}` : ""}
            </p>
          ) : null}

          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
            <Icon name="calendar" className="size-4 shrink-0 text-ink-faint" />
            <span className="min-w-0 truncate">
              {formatTime(session.heldAt)}
              {past ? " · past" : ""}
            </span>
          </p>

          <p className="mt-1 truncate text-xs text-ink-faint">
            {session.hostClub?.name ?? "Unknown club"}
            {session.presenter
              ? ` · ${`${session.presenter.firstName} ${session.presenter.lastName}`.trim()}`
              : ""}
          </p>
        </div>
      </div>
    </Card>
  );

  return href ? (
    // The Link is the grid item, so it carries min-w-0 as well.
    <Link href={href} className="press block min-w-0">
      {inner}
    </Link>
  ) : (
    inner
  );
}
