import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buttonClassName } from "@/components/ui/Button";
import { SessionCard } from "@/components/sessions/SessionCard";
import { BookCover } from "@/components/books/BookCover";
import { EventStrip } from "@/components/home/EventStrip";
import { PopularBooks } from "@/components/home/PopularBooks";
import {
  activeMemberships,
  isAdmin,
  membershipState,
  nextRenewalDate,
  requireActiveMember,
} from "@/lib/auth/session";
import { listSessions } from "@/lib/sessions/queries";
import { getReadRiseTotals } from "@/lib/orders/queries";
import { ReadRiseCard } from "@/components/books/ReadRiseCard";
import { getDiscoverFeed } from "@/lib/discover/queries";
import { getPopularBooks } from "@/lib/home/queries";
import { listCategories } from "@/lib/legacy/books";
import { getLeaderboard } from "@/lib/leaderboard/queries";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export const metadata: Metadata = { title: "Home" };

// Category chips cycle through these, so a row of them reads as a palette
// rather than eight identical grey pills.
const CATEGORY_STYLES: { icon: IconName; tone: string }[] = [
  { icon: "book", tone: "bg-rose-50 text-rose-700 border-rose-200" },
  { icon: "sparkle", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { icon: "star", tone: "bg-violet-50 text-violet-700 border-violet-200" },
  { icon: "bookmark", tone: "bg-sky-50 text-sky-800 border-sky-200" },
  { icon: "users", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  { icon: "trophy", tone: "bg-teal-50 text-teal-700 border-teal-200" },
  { icon: "film", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { icon: "medal", tone: "bg-orange-50 text-orange-700 border-orange-200" },
];

function SectionHead({ title, href, label = "View all" }: { title: string; href?: string; label?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-xl text-ink sm:text-2xl">{title}</h2>
      {href ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          {label}
          <Icon name="chevron-right" className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

export default async function FeedPage() {
  const member = await requireActiveMember();
  const clubs = activeMemberships(member);
  const renewal = nextRenewalDate(member);
  const state = membershipState(renewal);
  const myClubIds = new Set(clubs.map((c) => c.clubId));
  const supabase = await getServerComponentSupabase();

  const HEAD = { count: "exact" as const, head: true };
  const [
    sessions,
    readrise,
    events,
    popular,
    categoriesResult,
    board,
    { count: booksRead },
    { data: readingNow },
    { count: badgeCount },
  ] = await Promise.all([
    listSessions(),
    getReadRiseTotals(),
    getDiscoverFeed({ limit: 5 }),
    getPopularBooks(4),
    listCategories(),
    getLeaderboard("all"),
    supabase
      .from("reading_items")
      .select("*", HEAD)
      .eq("member_id", member.userId)
      .eq("status", "read"),
    supabase
      .from("reading_items")
      .select("id, title, author, cover_id")
      .eq("member_id", member.userId)
      .eq("status", "reading")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("member_badges").select("*", HEAD).eq("member_id", member.userId),
  ]);

  // The panel below used to be a hardcoded "No sessions yet" empty state that
  // never queried anything. Same query and same card as /sessions, capped.
  const upcoming = sessions.filter((s) => !s.isPast).reverse().slice(0, 3);
  const categories = (categoriesResult.ok ? categoriesResult.data : []).slice(0, 8);
  const me = board.find((r) => r.isMe && r.points > 0);
  const ranked = board.filter((r) => r.points > 0).length;
  const current = readingNow?.[0] ?? null;

  // Mirrors /sessions: free if you are in the host club. session_fee_for()
  // remains the authority at booking time.
  function feeFor(s: (typeof sessions)[number]): number {
    if (s.pricingKind === "free") return 0;
    if (s.hostClub && myClubIds.has(s.hostClub.id)) return 0;
    return Number(s.guestFeeLkr ?? 0);
  }

  return (
    <AppShell wide>
      <div className="space-y-8">
        {/*
          Hero: a greeting, a search straight into the catalogue, and the
          books members are reading stacked on the right -- the reference's
          shape, built from the club's own covers rather than stock imagery.
        */}
        <section className="reveal relative overflow-hidden rounded-panel bg-brand-950 shadow-band">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(760px 380px at 85% 10%, rgba(0,174,239,0.35), transparent 62%), radial-gradient(520px 300px at 0% 110%, rgba(41,56,150,0.9), transparent 70%)",
            }}
          />
          <div className="relative grid gap-6 px-5 py-7 sm:px-9 sm:py-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300">
                  Welcome back, {member.firstName || "reader"}
                </p>
                {clubs.slice(0, 2).map((club) => (
                  <span
                    key={club.clubId}
                    className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-100"
                  >
                    {club.clubName}
                  </span>
                ))}
                <Link
                  href="/me/points"
                  className="press rounded-full bg-gold-500 px-2.5 py-0.5 text-[11px] font-semibold text-brand-950 hover:bg-gold-100"
                >
                  {member.pointsBalance} points
                </Link>
              </div>
              <h1 className="mt-3 font-display text-3xl leading-[1.08] text-white sm:text-5xl">
                Find your next <em className="italic text-gold-500">favourite</em> book
              </h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-on-navy-muted sm:text-base">
                Browse the catalogue at your member price, see what the clubs have been up
                to, and book your next session.
              </p>

              <form action="/books" role="search" className="mt-5 flex max-w-xl gap-2">
                <label htmlFor="home-search" className="sr-only">
                  Search books
                </label>
                <div className="relative min-w-0 flex-1">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-faint"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="m16 16 4 4" />
                  </svg>
                  <input
                    id="home-search"
                    name="q"
                    type="search"
                    placeholder="Search books or authors"
                    className="min-h-12 w-full rounded-lg border border-white/20 bg-white pl-11 pr-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <button
                  type="submit"
                  className="press min-h-12 shrink-0 rounded-lg bg-sky-500 px-5 text-sm font-medium text-brand-950 hover:bg-sky-300"
                >
                  Search
                </button>
              </form>
            </div>

            {/* A fanned stack of the most popular covers. Decorative. */}
            {popular.length >= 3 ? (
              <div aria-hidden className="relative hidden h-56 lg:block">
                {popular.slice(0, 3).map((book, i) => (
                  <div
                    key={book.bookId}
                    className="absolute top-1/2 h-48 w-32 overflow-hidden rounded-md shadow-band ring-1 ring-white/10"
                    style={{
                      left: `${20 + i * 70}px`,
                      transform: `translateY(-50%) rotate(${(i - 1) * 8}deg)`,
                      zIndex: i === 1 ? 3 : 1,
                    }}
                  >
                    <BookCover src={book.imageUrl} title={book.title} size="fill" className="border-0" />
                  </div>
                ))}
              </div>
            ) : null}
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
                <p className="mt-0.5 text-sm text-ink-muted">Each club renews on its own date.</p>
              </div>
              <Link href="/renew" className={`${buttonClassName("primary", "sm")} shrink-0`}>
                Renew
              </Link>
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="min-w-0 space-y-8">
            {events.length ? (
              <section>
                <SectionHead title="From the club evenings" href="/discover" label="Discover" />
                <EventStrip
                  mode="member"
                  items={events.map((p) => ({
                    id: p.id,
                    kind: p.kind,
                    caption: p.caption,
                    clubName: p.clubName,
                  }))}
                />
              </section>
            ) : null}

            {popular.length ? (
              <section>
                <SectionHead title="Popular with members" href="/books" />
                <PopularBooks books={popular} href={(b) => `/books/${b.bookId}`} />
              </section>
            ) : null}

            {categories.length ? (
              <section>
                <SectionHead title="Explore categories" href="/books" label="All books" />
                <ul className="flex flex-wrap gap-2.5">
                  {categories.map((c, i) => {
                    const style = CATEGORY_STYLES[i % CATEGORY_STYLES.length];
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/books?category=${encodeURIComponent(c.id)}`}
                          className={`press inline-flex min-h-11 items-center gap-2 rounded-card border px-4 text-sm font-medium transition-shadow hover:shadow-card ${style.tone}`}
                        >
                          <Icon name={style.icon} className="size-[18px]" />
                          {c.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section>
              <SectionHead title="Coming up" href="/sessions" label="All sessions" />
              {upcoming.length === 0 ? (
                <Card flush>
                  <EmptyState
                    icon="calendar"
                    title="Nothing scheduled"
                    description="Book presentations will appear here once a club schedules one."
                  />
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
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
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            {/* The member's own numbers, every one of them real. */}
            <Card className="bg-linear-to-b from-cream to-surface">
              <CardHeader title="Your reading journey" />
              <ul className="space-y-3.5">
                {[
                  {
                    icon: "book" as const,
                    tone: "bg-sky-100 text-sky-800",
                    value: `${booksRead ?? 0} book${booksRead === 1 ? "" : "s"} read`,
                    note: current ? `Now reading ${current.title}` : "Add what you're reading",
                    href: "/me/reading",
                  },
                  {
                    icon: "star" as const,
                    tone: "bg-gold-100 text-gold-700",
                    value: `${member.pointsBalance} points`,
                    note: me ? `${ordinal(me.place)} of ${ranked} on the leaderboard` : "Come to a session to get on the board",
                    href: "/leaderboard?period=all",
                  },
                  {
                    icon: "medal" as const,
                    tone: "bg-violet-100 text-violet-700",
                    value: `${badgeCount ?? 0} badge${badgeCount === 1 ? "" : "s"}`,
                    note: "See what's next to earn",
                    href: "/me/badges",
                  },
                ].map((row) => (
                  <li key={row.value}>
                    <Link href={row.href} className="group flex items-center gap-3">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${row.tone}`}>
                        <Icon name={row.icon} className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink group-hover:text-brand-600">
                          {row.value}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">{row.note}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/me" className={`${buttonClassName("primary", "md")} mt-5 w-full`}>
                View profile
              </Link>
            </Card>

            {readrise ? <ReadRiseCard totals={readrise} /> : null}

            {isAdmin(member) ? (
              <Card>
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                    <Icon name="shield" className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg leading-tight text-ink">Club admin</h2>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      Record sessions, attendance and points.
                    </p>
                  </div>
                  <Link href="/admin" className={`${buttonClassName("secondary", "sm")} shrink-0`}>
                    Open
                  </Link>
                </div>
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
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
