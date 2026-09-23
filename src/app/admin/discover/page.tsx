import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { adminClubScope, requireStaff } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import {
  getManageablePosts,
  getPostStats,
  discoverMediaUrl,
  type DiscoverPost,
} from "@/lib/discover/queries";
import {
  DeletePostButton,
  DiscoverUploader,
  EditPostButton,
  SetThumbnailButton,
  type ClubOption,
  type SessionOption,
} from "./DiscoverUploader";

export const metadata: Metadata = { title: "Discover · Admin" };
export const dynamic = "force-dynamic";

function postLabel(post: DiscoverPost): string {
  return post.caption || (post.kind === "video" ? "Video" : "Photo");
}

function Thumb({ post, size = "size-12" }: { post: DiscoverPost; size?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-lg bg-brand-900 ${size}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={discoverMediaUrl(post.id, post.kind === "video")}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
      {post.kind === "video" ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-6 place-items-center rounded-full bg-black/55 text-white">
            <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 size-3" aria-hidden>
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** A short ranked list for the analytics panel; each row jumps to the post. */
function TopList({
  title,
  rows,
  unit,
}: {
  title: string;
  rows: { post: DiscoverPost; count: number }[];
  unit: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">Nothing yet.</p>
      ) : (
        <ol className="mt-2 space-y-1">
          {rows.map(({ post, count }) => (
            <li key={post.id}>
              <a
                href={`#post-${post.id}`}
                className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-canvas"
              >
                <Thumb post={post} size="size-10" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{postLabel(post)}</span>
                <span className="shrink-0 text-sm font-medium text-brand-600 tabular-nums">
                  {count} {count === 1 ? unit : `${unit}s`}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function AdminDiscoverPage() {
  const member = await requireStaff();
  const scope = adminClubScope(member);
  const supabase = await getServerComponentSupabase();

  let clubQuery = supabase
    .from("clubs")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  // Null scope is a super admin: every club. An empty one is a secretary with
  // no club, and `.in()` on an empty list correctly returns nothing.
  if (scope != null) clubQuery = clubQuery.in("id", scope);

  let sessionQuery = supabase
    .from("sessions")
    .select("id, title, host_club_id")
    .order("held_at", { ascending: false })
    .limit(100);
  if (scope != null) sessionQuery = sessionQuery.in("host_club_id", scope);

  const [{ data: clubRows }, { data: sessionRows }, posts, stats, { data: homeRows }] =
    await Promise.all([
      clubQuery,
      sessionQuery,
      getManageablePosts(),
      getPostStats(),
      supabase.from("discover_posts").select("id").eq("show_on_home", true),
    ]);
  const onHome = new Set((homeRows ?? []).map((r) => r.id));

  const clubs = (clubRows ?? []) as ClubOption[];
  const sessions: SessionOption[] = (
    (sessionRows ?? []) as unknown as { id: string; title: string; host_club_id: string }[]
  ).map((s) => ({ id: s.id, title: s.title, clubId: s.host_club_id }));

  // Posts the caller may actually remove. Every member sees every post now,
  // so for a secretary the feed includes other clubs' -- offering Remove on
  // those would only produce a refusal.
  const mine = scope == null ? posts : posts.filter((p) => p.clubId && scope.includes(p.clubId));

  const statOf = (p: DiscoverPost) => stats.get(p.id) ?? { likes: p.likeCount, saves: 0 };
  const totalLikes = mine.reduce((n, p) => n + statOf(p).likes, 0);
  const totalSaves = mine.reduce((n, p) => n + statOf(p).saves, 0);
  const top = (key: "likes" | "saves") =>
    mine
      .map((post) => ({ post, count: statOf(post)[key] }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

  return (
    <AdminShell>
      <BackLink href="/admin">Admin</BackLink>
      <PageHeader
        className="mt-1"
        title="Discover"
        description="Photos and video from your club's events. Every member can see them."
      />

      {/* Uploader on the left, how the posts are doing on the right -- the
          right half of the page used to be empty. */}
      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-3">
          <DiscoverUploader clubs={clubs} sessions={sessions} />
        </div>

        <Card className="lg:col-span-2 lg:sticky lg:top-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
            How your posts are doing
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Posts", value: mine.length },
              { label: "Likes", value: totalLikes },
              { label: "Saves", value: totalSaves },
            ].map((s) => (
              <div key={s.label} className="rounded-card bg-canvas px-2 py-3">
                <dd className="font-display text-2xl text-ink tabular-nums">{s.value}</dd>
                <dt className="text-xs text-ink-muted">{s.label}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-5 space-y-5">
            <TopList title="Most liked" rows={top("likes")} unit="like" />
            <TopList title="Most saved" rows={top("saves")} unit="save" />
          </div>

          <p className="mt-4 text-xs text-ink-faint">
            Saves are counted, never named: who saved a post stays private to them.
          </p>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 font-display text-lg text-ink">
        Posted{mine.length ? ` (${mine.length})` : ""}
      </h2>

      {mine.length === 0 ? (
        <Card flush>
          <EmptyState
            icon="sparkle"
            title="Nothing posted yet"
            description="Whatever you post above shows up here so you can take it down again."
          />
        </Card>
      ) : (
        <Card flush>
          <ul className="divide-y divide-line">
            {mine.map((post) => {
              const s = statOf(post);
              return (
                <li
                  key={post.id}
                  id={`post-${post.id}`}
                  className="scroll-mt-24 flex flex-wrap items-center gap-3 p-3 target:bg-gold-100/50"
                >
                  <a
                    href={discoverMediaUrl(post.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${postLabel(post)}`}
                  >
                    <Thumb post={post} size="size-16" />
                  </a>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{postLabel(post)}</p>
                    <p className="truncate text-xs text-ink-faint">
                      {post.clubName ?? "Pick a Book"} ·{" "}
                      {new Date(post.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                      {s.likes} like{s.likes === 1 ? "" : "s"} · {s.saves} save
                      {s.saves === 1 ? "" : "s"}
                      {onHome.has(post.id) ? (
                        <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                          On homepage
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <EditPostButton
                      post={post}
                      sessions={sessions}
                      showOnHome={onHome.has(post.id)}
                    />
                    {post.kind === "video" ? <SetThumbnailButton post={post} /> : null}
                    <DeletePostButton post={post} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AdminShell>
  );
}
