import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { adminClubScope, requireSecretary } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { getManageablePosts, discoverMediaUrl } from "@/lib/discover/queries";
import {
  DeletePostButton,
  DiscoverUploader,
  type ClubOption,
  type SessionOption,
} from "./DiscoverUploader";

export const metadata: Metadata = { title: "Discover · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminDiscoverPage() {
  const member = await requireSecretary();
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

  const [{ data: clubRows }, { data: sessionRows }, posts] = await Promise.all([
    clubQuery,
    sessionQuery,
    getManageablePosts(),
  ]);

  const clubs = (clubRows ?? []) as ClubOption[];
  const sessions: SessionOption[] = (
    (sessionRows ?? []) as unknown as { id: string; title: string; host_club_id: string }[]
  ).map((s) => ({ id: s.id, title: s.title, clubId: s.host_club_id }));

  // Posts the caller may actually remove. The feed shows everything they can
  // SEE, which for a secretary includes other public clubs under the same
  // type -- offering Remove on those would only produce a refusal.
  const mine = scope == null ? posts : posts.filter((p) => p.clubId && scope.includes(p.clubId));

  return (
    <AppShell>
      <BackLink href="/admin">Admin</BackLink>
      <PageHeader
        className="mt-1"
        title="Discover"
        description="Photos and video from your club's events, for members to see."
        action={
          <Link href="/discover" className={buttonClassName("secondary", "sm")}>
            View the feed
          </Link>
        }
      />

      <div className="space-y-4 max-w-xl">
        <DiscoverUploader clubs={clubs} sessions={sessions} />

        <h2 className="font-display text-lg text-ink pt-2">
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
              {mine.map((post) => (
                <li key={post.id} className="p-3 flex items-center gap-3">
                  <div className="size-16 shrink-0 rounded-lg overflow-hidden bg-canvas-deep">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={discoverMediaUrl(post.id, post.kind === "video")}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">
                      {post.caption || (post.kind === "video" ? "Video" : "Photo")}
                    </p>
                    <p className="text-xs text-ink-faint truncate">
                      {post.clubName ?? "Pick a Book"} ·{" "}
                      {new Date(post.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                      {post.likeCount > 0 ? ` · ${post.likeCount} like${post.likeCount === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <DeletePostButton post={post} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
