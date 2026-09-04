import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
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
    <Card className="h-full" interactive={Boolean(href)}>
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

      <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-muted">
        <Icon name="calendar" className="size-4 shrink-0 text-ink-faint" />
        <span className="min-w-0 truncate">
          {formatWhen(session.heldAt)}
          {past ? " · past" : ""}
        </span>
      </p>

      <p className="text-xs text-ink-faint mt-1.5">
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
