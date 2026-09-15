import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClassName } from "@/components/ui/Button";
import { DiscoverGrid } from "@/components/discover/DiscoverGrid";
import { isAdmin, requireActiveMember } from "@/lib/auth/session";
import { discoverMediaUrl, getDiscoverFeed } from "@/lib/discover/queries";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const member = await requireActiveMember();
  const sp = await searchParams;
  const all = await getDiscoverFeed({ limit: 60 });

  // Clubs that have posted, for the filter chips -- only ones with something
  // to show, most active first.
  const byClub = new Map<string, { id: string; name: string; count: number }>();
  for (const p of all) {
    if (!p.clubId) continue;
    const entry = byClub.get(p.clubId) ?? { id: p.clubId, name: p.clubName ?? "Club", count: 0 };
    entry.count += 1;
    byClub.set(p.clubId, entry);
  }
  const clubs = [...byClub.values()].sort((a, b) => b.count - a.count);

  const club = sp.club && byClub.has(sp.club) ? sp.club : null;
  const posts = club ? all.filter((p) => p.clubId === club) : all;

  const mostLiked = [...all]
    .filter((p) => p.likeCount > 0)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 4);
  const savedCount = all.filter((p) => p.savedByMe).length;
  const videos = all.filter((p) => p.kind === "video").length;

  const chip = (active: boolean) =>
    `press inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors ${
      active
        ? "border-brand-600 bg-brand-600 text-white"
        : "border-line bg-surface text-ink-muted hover:text-ink"
    }`;

  return (
    <AppShell wide>
      {/* A short navy band instead of a bare heading, carrying the numbers. */}
      <section className="reveal relative mb-5 overflow-hidden rounded-panel bg-brand-900 px-5 py-6 shadow-band sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(620px 300px at 90% -30%, rgba(0,174,239,0.5), transparent 62%)",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">
              From the clubs
            </p>
            <h1 className="mt-1 font-display text-3xl text-white sm:text-4xl">Discover</h1>
            <p className="mt-1.5 max-w-md text-sm text-on-navy-muted">
              Photos and video from club evenings, posted by the people running them.
            </p>
            <p className="mt-3 text-xs text-sky-200">
              {all.length} post{all.length === 1 ? "" : "s"} · {videos} video
              {videos === 1 ? "" : "s"} · {clubs.length} club{clubs.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/discover/saved"
              className="press inline-flex min-h-10 items-center rounded-lg border border-white/30 px-4 text-sm font-medium text-white hover:bg-white/10"
            >
              Saved{savedCount ? ` (${savedCount})` : ""}
            </Link>
            {isAdmin(member) ? (
              <Link
                href="/admin/discover"
                className="press inline-flex min-h-10 items-center rounded-lg bg-sky-500 px-4 text-sm font-medium text-brand-950 hover:bg-sky-300"
              >
                Post
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {all.length === 0 ? (
        <Card flush>
          <EmptyState
            icon="sparkle"
            title="Nothing here yet"
            description="When your club posts photos or video from an event, it appears here."
          />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
          <div className="min-w-0">
            {clubs.length > 1 ? (
              <nav aria-label="Filter by club" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                  <li>
                    <Link href="/discover" className={chip(club == null)}>
                      All
                    </Link>
                  </li>
                  {clubs.map((c) => (
                    <li key={c.id}>
                      <Link href={`/discover?club=${c.id}`} className={chip(club === c.id)}>
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            <DiscoverGrid posts={posts} />
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
                Most liked
              </p>
              {mostLiked.length === 0 ? (
                <p className="mt-2 text-sm text-ink-faint">No likes yet — be the first.</p>
              ) : (
                <ol className="mt-3 space-y-2.5">
                  {mostLiked.map((p, i) => (
                    <li key={p.id}>
                      <a href={`#${p.id}`} className="group flex items-center gap-3">
                        <span className="w-4 shrink-0 text-center font-display text-sm text-ink-faint">
                          {i + 1}
                        </span>
                        <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-brand-900">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={discoverMediaUrl(p.id, p.kind === "video")}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink group-hover:text-brand-600">
                            {p.caption ?? (p.kind === "video" ? "Video" : "Photo")}
                          </span>
                          <span className="block text-xs text-ink-faint">
                            {p.likeCount} like{p.likeCount === 1 ? "" : "s"}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card tone="brand">
              <p className="font-display text-lg leading-tight text-ink">Missed an evening?</p>
              <p className="mt-1 text-sm text-ink-muted">
                Recordings of full sessions live in Recordings, and upcoming ones in Sessions.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/videos" className={buttonClassName("secondary", "sm")}>
                  Recordings
                </Link>
                <Link href="/sessions" className={buttonClassName("ghost", "sm")}>
                  Sessions
                </Link>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
