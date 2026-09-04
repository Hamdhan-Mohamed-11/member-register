import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, Stat } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/Button";
import { SessionCard } from "@/components/sessions/SessionCard";
import {
  activeMemberships,
  isAdmin,
  membershipState,
  nextRenewalDate,
  requireActiveMember,
} from "@/lib/auth/session";
import { avatarUrl } from "@/lib/members/queries";
import { listSessions } from "@/lib/sessions/queries";

export const metadata: Metadata = { title: "Home" };

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function FeedPage() {
  const member = await requireActiveMember();
  const clubs = activeMemberships(member);
  const renewal = nextRenewalDate(member);
  const state = membershipState(renewal);

  const myClubIds = new Set(clubs.map((c) => c.clubId));

  // The panel below used to be a hardcoded "No sessions yet" empty state that
  // never queried anything -- so the home page said the club had nothing
  // scheduled while /sessions listed a dozen. Same query and same card as that
  // page, capped at the next three.
  const sessions = await listSessions();
  const upcoming = sessions.filter((s) => !s.isPast).reverse().slice(0, 3);

  // Mirrors /sessions: free if you are in the host club. session_fee_for()
  // remains the authority at booking time.
  function feeFor(s: (typeof sessions)[number]): number {
    if (s.pricingKind === "free") return 0;
    if (s.hostClub && myClubIds.has(s.hostClub.id)) return 0;
    return Number(s.guestFeeLkr ?? 0);
  }

  return (
    <AppShell>
      <div className="space-y-4">
        {/*
          The one warm panel on the page. Cream rather than white so the
          greeting reads as a header and the cards below it read as content --
          previously everything on this page was the same white card and the
          eye had nowhere to start.
        */}
        <Card tone="cream">
          <div className="flex items-start gap-4">
            <Avatar
              src={avatarUrl(member.userId, member.avatarPath)}
              firstName={member.firstName}
              lastName={member.lastName}
              size="md"
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl sm:text-3xl leading-tight text-ink">
                Hello, {member.firstName || "there"}
              </h1>
              {clubs.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {clubs.map((club) => (
                    <Badge key={club.clubId} tone="brand">
                      {club.clubName}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-ink-muted">
                  You&apos;re not in a club yet.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-cream-deep flex flex-wrap gap-x-10 gap-y-4">
            <Link href="/me/points" className="rounded-lg">
              <Stat value={member.pointsBalance} label="points" />
            </Link>
            <Stat
              value={renewal ? formatDate(renewal) : "—"}
              label={clubs.length > 1 ? "next renewal" : "renews on"}
              tone="ink"
            />
          </div>
        </Card>

        {state === "expired" || state === "expiring_soon" ? (
          <Card tone={state === "expired" ? "danger" : "warning"}>
            <div className="flex items-start gap-3">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full ${
                  state === "expired"
                    ? "bg-danger-100 text-danger-600"
                    : "bg-warning-100 text-warning-600"
                }`}
              >
                <Icon name="refresh" className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg leading-tight text-ink">
                  {state === "expired"
                    ? "A club membership has expired"
                    : "A club membership is expiring soon"}
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Each club renews on its own date.
                </p>
              </div>
              <Link
                href="/renew"
                className={`${buttonClassName("primary", "sm")} shrink-0`}
              >
                Renew
              </Link>
            </div>
          </Card>
        ) : null}

        <Card flush>
          <div className="p-4 sm:p-5 pb-2">
            <CardHeader
              title="Coming up"
              description="Sessions from your clubs, plus paid sessions you can book as a guest."
              action={
                <Link
                  href="/sessions"
                  className={buttonClassName("ghost", "sm")}
                >
                  See all
                </Link>
              }
            />
          </div>

          {upcoming.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nothing scheduled"
              description="Book presentations will appear here once a club schedules one."
            />
          ) : (
            <div className="px-4 sm:px-5 pb-4 sm:pb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  fee={feeFor(session)}
                  href={`/sessions/${session.id}`}
                />
              ))}
            </div>
          )}
        </Card>

        {isAdmin(member) ? (
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Icon name="shield" className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg leading-tight text-ink">
                  Club admin
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Record sessions, attendance and points.
                </p>
              </div>
              <Link
                href="/admin"
                className={`${buttonClassName("secondary", "sm")} shrink-0`}
              >
                Open
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
