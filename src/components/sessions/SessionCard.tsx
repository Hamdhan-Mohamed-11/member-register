import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { SessionSummary } from "@/lib/sessions/queries";

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
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
  const past = new Date(session.heldAt) < new Date();

  const inner = (
    <Card className="h-full hover:shadow-raised transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{session.title}</p>
          {session.bookTitle ? (
            <p className="text-sm text-ink-muted truncate">
              {session.bookTitle}
              {session.bookAuthor ? ` · ${session.bookAuthor}` : ""}
            </p>
          ) : null}
        </div>

        {session.status === "cancelled" ? (
          <span className="shrink-0 text-xs font-medium text-danger-600 bg-danger-100 rounded-full px-2 py-0.5">
            Cancelled
          </span>
        ) : fee === undefined ? null : fee === 0 ? (
          <span className="shrink-0 text-xs font-medium text-success-600 bg-success-100 rounded-full px-2 py-0.5">
            Free
          </span>
        ) : (
          <span className="shrink-0 text-xs font-medium text-warning-600 bg-warning-100 rounded-full px-2 py-0.5">
            {formatLkr(fee)}
          </span>
        )}
      </div>

      <p className="text-sm text-ink-muted mt-2">
        {formatWhen(session.heldAt)}
        {past ? " · past" : ""}
      </p>

      <p className="text-xs text-ink-faint mt-1">
        {session.hostClub?.name ?? "Unknown club"}
        {session.presenter
          ? ` · presented by ${`${session.presenter.firstName} ${session.presenter.lastName}`.trim()}`
          : ""}
      </p>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
