import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { activeMemberships, requireActiveMember } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import {
  getLeaderboard,
  LEADERBOARD_PERIODS,
  PERIOD_LABELS,
  parsePeriod,
  type LeaderboardPeriod,
} from "@/lib/leaderboard/queries";

export const metadata: Metadata = { title: "Leaderboard" };

/**
 * The top three get a medal colour; everyone else gets their number.
 *
 * Ties genuinely share a place — the RPC uses rank() — so two silvers and no
 * bronze is correct output, not a bug to work around.
 */
function placeStyle(place: number): string {
  if (place === 1) return "bg-gold-100 text-gold-700 border-gold-700/25";
  if (place === 2) return "bg-canvas-deep text-ink-muted border-line-strong";
  if (place === 3) return "bg-warning-100 text-warning-600 border-warning-600/25";
  return "bg-transparent text-ink-faint border-transparent";
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const member = await requireActiveMember();
  const sp = await searchParams;
  const period: LeaderboardPeriod = parsePeriod(sp.period);
  const rows = await getLeaderboard(period);
  const clubs = activeMemberships(member);

  const me = rows.find((r) => r.isMe);
  // Everyone below the fold still deserves to know where they stand, so the
  // member's own row is repeated at the top when it is not already visible
  // near it. Ten is roughly one screen on a phone.
  const showMyStanding = me != null && me.place > 10;

  return (
    <AppShell>
      <PageHeader
        title="Leaderboard"
        description={
          clubs.length
            ? "Points from sessions you attend, books you present, and what you read."
            : "Join a club to be ranked."
        }
      />

      {/*
        Links, not buttons: each period is a real URL, so a member can bookmark
        the yearly board and the back button does what they expect. It also
        means the page needs no client-side JavaScript at all.
      */}
      <div
        className="inline-flex rounded-full border border-line bg-surface p-1 mb-4"
        role="tablist"
        aria-label="Leaderboard period"
      >
        {LEADERBOARD_PERIODS.map((p) => {
          const current = p === period;
          return (
            <Link
              key={p}
              href={p === "month" ? "/leaderboard" : `/leaderboard?period=${p}`}
              role="tab"
              aria-selected={current}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                current
                  ? "bg-brand-600 text-white"
                  : "text-ink-muted hover:text-ink hover:bg-canvas-deep"
              }`}
            >
              {PERIOD_LABELS[p]}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card flush>
          <EmptyState
            icon="star"
            title="Nothing to rank yet"
            description={
              clubs.length
                ? "Once your club records a session, points start appearing here."
                : "Your club memberships have lapsed, so there is no board to show. Renew to rejoin one."
            }
          />
        </Card>
      ) : (
        <>
          {showMyStanding ? (
            <Card tone="brand" className="mb-3">
              <p className="text-sm text-ink-muted">
                You are{" "}
                <span className="font-medium text-ink">
                  {ordinal(me.place)} of {rows.length}
                </span>{" "}
                {period === "all" ? "overall" : `for ${PERIOD_LABELS[period].toLowerCase()}`}
                , on <span className="font-medium text-ink">{me.points}</span> point
                {me.points === 1 ? "" : "s"}.
              </p>
            </Card>
          ) : null}

          <Card flush className="reveal">
            <ol className="divide-y divide-line">
              {rows.map((row) => {
                const name = `${row.firstName} ${row.lastName}`.trim() || "Member";
                return (
                  <li key={row.memberId}>
                    <Link
                      href={row.isMe ? "/me" : `/members/${row.memberId}`}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas-deep ${
                        row.isMe ? "bg-brand-50" : ""
                      }`}
                    >
                      <span
                        className={`shrink-0 grid place-items-center size-8 rounded-full border font-display text-sm tabular-nums ${placeStyle(
                          row.place,
                        )}`}
                      >
                        {row.place}
                      </span>

                      <Avatar
                        src={avatarUrl(row.memberId, row.avatarPath)}
                        firstName={row.firstName}
                        lastName={row.lastName}
                        size="sm"
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink truncate">
                          {name}
                          {row.isMe ? (
                            <span className="ml-1.5 text-xs font-normal text-brand-600">
                              you
                            </span>
                          ) : null}
                        </span>
                        {row.clubName ? (
                          <span className="block text-xs text-ink-muted truncate">
                            {row.clubName}
                          </span>
                        ) : null}
                      </span>

                      <span className="shrink-0 text-sm font-medium text-brand-600 tabular-nums">
                        {row.points}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Card>

          <p className="mt-3 text-xs text-ink-faint">
            You are ranked against the members you can see in the directory —
            everyone across the public clubs, or your own company only.
          </p>
        </>
      )}
    </AppShell>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
