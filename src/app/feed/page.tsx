import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardHeader } from "@/components/ui/Card";
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
import { getReadRiseTotals } from "@/lib/orders/queries";
import { ReadRiseCard } from "@/components/books/ReadRiseCard";

export const metadata: Metadata = { title: "Home" };

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
  const [sessions, readrise] = await Promise.all([
    listSessions(),
    getReadRiseTotals(),
  ]);
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
      <div className="space-y-4 stagger">
        {/*
          The page's anchor, in the brand's two blues.
          
          It was a cream card, which read as "a card, but beige" rather than as
          a header -- the eye had nowhere to start and the whole page was one
          flat tone. A dark panel at the top gives the rest of the page
          something to be lighter than, and it is the same treatment the
          signed-out landing page opens with, so the two halves of the product
          look related.
        */}
        <section className="relative overflow-hidden rounded-panel bg-brand-900 p-5 shadow-band sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(680px 340px at 88% -20%, rgba(0,174,239,0.48), transparent 62%)",
            }}
          />

          <div className="relative">
            {/*
              One row: avatar, greeting and club on the left, points on the
              right (review item 12). The renewal date is gone from here -- it
              lives on /me and in the expiring-soon banner below, which only
              appears when it actually matters.
            */}
            <div className="flex items-center gap-4">
              <Avatar
                src={avatarUrl(member.userId, member.avatarPath)}
                firstName={member.firstName}
                lastName={member.lastName}
                size="md"
                className="ring-2 ring-white/25"
              />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-2xl leading-tight text-white sm:text-3xl">
                  Hello, {member.firstName || "there"}
                </h1>
                {clubs.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {clubs.map((club) => (
                      <span
                        key={club.clubId}
                        className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-medium text-sky-200"
                      >
                        {club.clubName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-on-navy-muted">
                    You&apos;re not in a club yet.
                  </p>
                )}
              </div>

              <Link
                href="/me/points"
                className="press shrink-0 rounded-card border border-white/15 bg-white/8 px-4 py-2.5 text-right transition-colors hover:bg-white/12"
              >
                <p className="font-display text-3xl leading-none text-sky-300 tabular-nums">
                  {member.pointsBalance}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-on-navy-muted">
                  points
                </p>
              </Link>
            </div>
          </div>
        </section>

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

        {/*
          Placed above "Coming up" rather than at the foot of the page: the
          club wants members to notice it, and nobody scrolls to the bottom of
          a home page. It renders for everyone -- a member who has not bought
          anything sees the pitch instead of their total.
        */}
        {readrise ? <ReadRiseCard totals={readrise} /> : null}

        {/*
          The bottom bar is full at five items, so Discover is reachable from
          here, from /sessions and from the account menu rather than being a
          sixth tab nobody can hit with a thumb.
        */}
        <Link href="/discover" className="block">
          <Card interactive>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg text-ink leading-tight">Discover</p>
                <p className="text-sm text-ink-muted">
                  Photos and video from what the clubs have been up to.
                </p>
              </div>
              <Icon name="chevron-right" className="size-5 shrink-0 text-ink-faint" />
            </div>
          </Card>
        </Link>

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
