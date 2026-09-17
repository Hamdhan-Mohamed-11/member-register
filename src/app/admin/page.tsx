import type { Metadata } from "next";
import { CLUB_TZ } from "@/lib/time";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { adminClubScope, requireSecretary } from "@/lib/auth/session";
import { getDashboard } from "@/lib/admin/dashboard";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const lkr = (n: number) =>
  `LKR ${n.toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: CLUB_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One number on the dashboard.
 *
 * `urgent` tints it when the figure is a queue with something in it. A
 * dashboard where every tile looks the same makes the reader hunt for the one
 * that needs them, and the entire point of the page is that they should not
 * have to.
 */
function Kpi({
  label,
  value,
  hint,
  icon,
  href,
  urgent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: IconName;
  href?: string;
  urgent?: boolean;
}) {
  const body = (
    <Card
      interactive={Boolean(href)}
      className={`press h-full ${urgent ? "border-warning-600/30 bg-warning-100/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {label}
        </p>
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full ${
            urgent ? "bg-warning-100 text-warning-600" : "bg-sky-100 text-sky-700"
          }`}
        >
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <p className="mt-2 font-display text-3xl leading-none text-ink tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-ink-faint">{hint}</p> : null}
    </Card>
  );

  return href ? (
    <Link href={href} className="block min-w-0">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function AdminDashboard() {
  const member = await requireSecretary();
  const isSuper = member.role === "super_admin";
  const scope = adminClubScope(member);
  const { stats, upcoming, recentMembers } = await getDashboard(scope);

  // The club's hour, not the server's: the VPS runs in UTC, and at 3pm in
  // Colombo it would still be saying good morning.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: CLUB_TZ, hour: "numeric", hourCycle: "h23" }).format(
      new Date(),
    ),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // The attention list: only things that genuinely wait on this person, in the
  // order they should be done. Empty is the good state, and it says so.
  const attention = [
    stats.pendingJoinRequests > 0 && {
      href: "/admin/join-requests",
      text: `${stats.pendingJoinRequests} join request${stats.pendingJoinRequests === 1 ? "" : "s"} to decide`,
      icon: "inbox" as const,
    },
    isSuper &&
      (stats.ordersNeedingPrice ?? 0) > 0 && {
        href: "/admin/orders",
        text: `${stats.ordersNeedingPrice} book order${stats.ordersNeedingPrice === 1 ? "" : "s"} waiting for a price`,
        icon: "book" as const,
      },
    // New borrow requests. Only overdue books were listed here, so a fresh
    // request produced no prompt anywhere -- one sat unnoticed that way.
    isSuper &&
      (stats.borrowsWaiting ?? 0) > 0 && {
        href: "/admin/library",
        text: `${stats.borrowsWaiting} borrow request${stats.borrowsWaiting === 1 ? "" : "s"} to approve`,
        icon: "bookmark" as const,
      },
    isSuper &&
      (stats.overdueBorrows ?? 0) > 0 && {
        href: "/admin/library",
        text: `${stats.overdueBorrows} borrowed book${stats.overdueBorrows === 1 ? " is" : "s are"} overdue`,
        icon: "bookmark" as const,
      },
    isSuper &&
      (stats.ordersToHandOver ?? 0) > 0 && {
        href: "/admin/orders",
        text: `${stats.ordersToHandOver} paid order${stats.ordersToHandOver === 1 ? "" : "s"} to hand over`,
        icon: "check" as const,
      },
    stats.videosAwaitingReview > 0 && {
      href: "/admin/videos",
      text: `${stats.videosAwaitingReview} video${stats.videosAwaitingReview === 1 ? "" : "s"} to review`,
      icon: "play" as const,
    },
  ].filter(Boolean) as { href: string; text: string; icon: IconName }[];

  const noClub = !isSuper && !member.secretaryClubId;

  return (
    <AdminShell>
      {/* ---- Header -------------------------------------------------- */}
      <section className="reveal relative mb-6 overflow-hidden rounded-panel bg-brand-900 p-5 shadow-band sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(640px 320px at 90% -20%, rgba(0,174,239,0.45), transparent 62%)",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">
              {isSuper ? "Super admin" : "Secretary"}
            </p>
            <h1 className="mt-1 font-display text-2xl leading-tight text-white sm:text-3xl">
              {greeting}, {member.firstName || "there"}
            </h1>
            <p className="mt-1 text-sm text-on-navy-muted">
              {isSuper
                ? "Everything across every club."
                : member.secretaryClubName
                  ? `Everything for ${member.secretaryClubName}.`
                  : "No club has been assigned to you yet."}
            </p>
          </div>

          {noClub ? null : (
            <Link
              href="/admin/sessions/new"
              className="press inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-500 px-4 text-sm font-medium text-brand-950 shadow-hero transition-colors hover:bg-sky-300"
            >
              <Icon name="calendar" className="size-4" />
              New session
            </Link>
          )}
        </div>
      </section>

      {noClub ? (
        <Card tone="warning">
          <p className="text-sm text-ink">
            A super admin needs to appoint you as a club&apos;s secretary. Until
            then there is nothing here for you to act on.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ---- Needs you ------------------------------------------- */}
          <section>
            <h2 className="font-display text-lg text-ink">Needs your attention</h2>
            {attention.length === 0 ? (
              <Card tone="sky" className="mt-3">
                <p className="flex items-center gap-2 text-sm text-ink">
                  <Icon name="check" className="size-5 text-success-600" />
                  Nothing is waiting on you. Everything is up to date.
                </p>
              </Card>
            ) : (
              <Card flush className="mt-3">
                <ul className="stagger divide-y divide-line">
                  {attention.map((item) => (
                    <li key={item.text}>
                      <Link
                        href={item.href}
                        className="press flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning-100 text-warning-600">
                          <Icon name={item.icon} className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                          {item.text}
                        </span>
                        <Icon name="chevron-right" className="size-4 shrink-0 text-ink-faint" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {/* ---- The numbers ----------------------------------------- */}
          <section>
            <h2 className="font-display text-lg text-ink">
              {isSuper ? "Across the clubs" : "Your club"}
            </h2>
            <div className="stagger mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                label="Members"
                value={stats.activeMembers}
                hint={
                  stats.newMembersThisMonth
                    ? `+${stats.newMembersThisMonth} this month`
                    : "none new this month"
                }
                icon="users"
                href={isSuper ? "/admin/members" : undefined}
              />
              <Kpi
                label="Join requests"
                value={stats.pendingJoinRequests}
                hint="waiting for a decision"
                icon="inbox"
                href="/admin/join-requests"
                urgent={stats.pendingJoinRequests > 0}
              />
              <Kpi
                label="Upcoming"
                value={stats.upcomingSessions}
                hint="sessions scheduled"
                icon="calendar"
                href="/admin/sessions"
              />
              <Kpi
                label="Attended"
                value={stats.attendanceThisMonth}
                hint={`across ${stats.sessionsThisMonth} session${stats.sessionsThisMonth === 1 ? "" : "s"} this month`}
                icon="check"
              />
            </div>
          </section>

          {isSuper ? (
            <section>
              <h2 className="font-display text-lg text-ink">Books and money</h2>
              <div className="stagger mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi
                  label="Payments"
                  value={lkr(stats.paymentsThisMonthLkr ?? 0)}
                  hint="received this month"
                  icon="card"
                  href="/admin/payments"
                />
                <Kpi
                  label="Orders to price"
                  value={stats.ordersNeedingPrice ?? 0}
                  hint="waiting on you"
                  icon="book"
                  href="/admin/orders"
                  urgent={(stats.ordersNeedingPrice ?? 0) > 0}
                />
                <Kpi
                  label="Borrowing"
                  value={stats.borrowsWaiting ?? 0}
                  hint={
                    stats.overdueBorrows
                      ? `${stats.overdueBorrows} overdue`
                      : "requests waiting"
                  }
                  icon="bookmark"
                  href="/admin/library"
                  urgent={(stats.overdueBorrows ?? 0) > 0}
                />
                <Kpi
                  label="Read and Rise"
                  value={lkr(stats.readriseLkr ?? 0)}
                  hint="given to schools"
                  icon="sparkle"
                />
              </div>
            </section>
          ) : null}

          {/* ---- Two lists ------------------------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="min-w-0">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg text-ink">Coming up</h2>
                <Link href="/admin/sessions" className="text-sm text-brand-600 hover:underline">
                  All sessions
                </Link>
              </div>
              <Card flush className="mt-3">
                {upcoming.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-ink-muted">
                    Nothing scheduled.{" "}
                    <Link href="/admin/sessions/new" className="text-brand-600 hover:underline">
                      Create a session
                    </Link>
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {upcoming.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/admin/sessions/${s.id}`}
                          className="press flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink">{s.title}</p>
                            <p className="truncate text-xs text-ink-muted">
                              {when(s.heldAt)}
                              {isSuper && s.clubName ? ` · ${s.clubName}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 tabular-nums">
                            {s.bookings} booked
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>

            <section className="min-w-0">
              <h2 className="font-display text-lg text-ink">Newest members</h2>
              <Card flush className="mt-3">
                {recentMembers.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-ink-muted">
                    No members yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {recentMembers.map((m) => (
                      <li key={`${m.id}-${m.clubName}`} className="flex items-center gap-3 px-4 py-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                          {m.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() ?? "")
                            .join("")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                          <p className="truncate text-xs text-ink-muted">
                            {m.clubName ?? "—"}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-ink-faint">
                          {new Date(`${m.joinedOn}T00:00:00`).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
