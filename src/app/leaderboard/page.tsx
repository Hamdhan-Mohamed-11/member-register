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
  type LeaderboardRow,
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

function fullName(row: LeaderboardRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || "Member";
}

type PodiumGroup = { place: number; rows: LeaderboardRow[] };

/**
 * The top three PLACES, on a podium: second on the left, first raised in the
 * middle, third on the right (review item 18).
 *
 * Places, not people. Ties genuinely share a place -- the RPC uses rank() --
 * so when two members are level on third, both stand on the third step
 * rather than one of them being dropped to the list below.
 */
function Podium({ groups }: { groups: PodiumGroup[] }) {
  // Visual order 2, 1, 3, each pinned to its own column so first stays in the
  // middle even when only one or two places are filled.
  const slots = [
    { group: groups[1], col: "col-start-1" },
    { group: groups[0], col: "col-start-2" },
    { group: groups[2], col: "col-start-3" },
  ].filter((s): s is { group: PodiumGroup; col: string } => s.group != null);

  const ring: Record<number, string> = {
    1: "ring-gold-500",
    2: "ring-line-strong",
    3: "ring-warning-600/50",
  };
  const chip: Record<number, string> = {
    1: "bg-gold-500 text-brand-950",
    2: "bg-canvas-deep text-ink border border-line-strong",
    3: "bg-warning-100 text-warning-600 border border-warning-600/25",
  };

  return (
    <Card className="reveal mb-4 overflow-hidden bg-linear-to-b from-gold-100/70 to-surface">
      <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
        Top of the board
      </p>
      <ol className="mx-auto mt-4 grid max-w-xl grid-cols-3 items-end gap-3">
        {slots.map(({ group, col }) => {
          const top = group === groups[0];
          const tier = Math.min(group.place, 3);
          const shared = group.rows.length > 1;
          return (
            <li
              key={group.place}
              // Tied members stand side by side on their step. Stacked, the
              // shared step grew taller than first place, which read as if
              // they had won.
              className={`row-start-1 flex min-w-0 flex-col items-center gap-1.5 text-center ${col} ${
                top ? "" : "pt-6"
              }`}
            >
              <div className={`flex w-full min-w-0 items-end justify-center ${shared ? "gap-3" : ""}`}>
              {group.rows.map((row) => (
                <Link
                  key={row.memberId}
                  href={row.isMe ? "/me" : `/members/${row.memberId}`}
                  className={`group inline-flex min-w-0 flex-col items-center ${shared ? "flex-1" : "w-full"}`}
                >
                  <span className="relative">
                    <Avatar
                      src={avatarUrl(row.memberId, row.avatarPath)}
                      firstName={row.firstName}
                      lastName={row.lastName}
                      size={shared ? "sm" : top ? "lg" : "md"}
                      className={`ring-4 ${ring[tier]}`}
                    />
                    <span
                      className={`absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full font-display text-xs tabular-nums ${chip[tier]}`}
                    >
                      {row.place}
                    </span>
                  </span>
                  <span
                    className={`mt-2 block w-full truncate font-display text-ink group-hover:text-brand-600 ${
                      shared ? "text-xs" : top ? "text-base" : "text-sm"
                    }`}
                  >
                    {row.isMe ? "You" : fullName(row)}
                  </span>
                  <span
                    className={`font-medium tabular-nums ${shared ? "text-[11px]" : "text-xs"} ${
                      top ? "text-gold-700" : "text-brand-600"
                    }`}
                  >
                    {row.points} pts
                  </span>
                </Link>
              ))}
              </div>

              {shared ? (
                <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                  Joint {ordinal(group.place)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const member = await requireActiveMember();
  const sp = await searchParams;
  const period: LeaderboardPeriod = parsePeriod(sp.period);
  // Nobody on nought points is ranked (review item 18): a board that runs on
  // into forty members tied last on zero says "nobody here does anything".
  const rows = (await getLeaderboard(period)).filter((r) => r.points > 0);
  const clubs = activeMemberships(member);
  // The first three PLACES, with everyone who shares them. Ties put two
  // people on one step instead of pushing the second into the list below.
  const podium: { place: number; rows: typeof rows }[] = [];
  for (const row of rows) {
    const group = podium.find((g) => g.place === row.place);
    if (group) group.rows.push(row);
    else if (podium.length < 3) podium.push({ place: row.place, rows: [row] });
  }
  const onPodium = new Set(podium.flatMap((g) => g.rows.map((r) => r.memberId)));
  const rest = rows.filter((r) => !onPodium.has(r.memberId));

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
                ? "Nobody has points for this period yet. They appear once your club records a session."
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
                {period === "all" ? "overall" : `for ${PERIOD_LABELS[period].toLowerCase()}`}, on{" "}
                <span className="font-medium text-ink">{me.points}</span> point
                {me.points === 1 ? "" : "s"}.
              </p>
            </Card>
          ) : null}

          <Podium groups={podium} />

          {!me && clubs.length ? (
            <p className="mb-3 text-sm text-ink-muted">
              You&apos;re not on the board yet
              {period === "all" ? "" : ` for ${PERIOD_LABELS[period].toLowerCase()}`}. Come to a
              session or present a book to get your first points.
            </p>
          ) : null}

          {rest.length ? (
            <Card flush className="reveal">
              <ol className="divide-y divide-line">
                {rest.map((row) => {
                  const name = fullName(row);
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
                              <span className="ml-1.5 text-xs font-normal text-brand-600">you</span>
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
          ) : null}

          <p className="mt-3 text-xs text-ink-faint">
            You are ranked against the members you can see in the directory — everyone across the
            public clubs, or your own company only.
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
