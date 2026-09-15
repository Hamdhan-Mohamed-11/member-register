import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export { discoverMediaUrl } from "./media";
export type { DiscoverPost } from "./media";

import type { DiscoverPost } from "./media";

type Raw = {
  id: string;
  club_id: string | null;
  club_name: string | null;
  session_id: string | null;
  kind: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  created_at: string;
  author_name: string | null;
  like_count: number | string;
  liked_by_me: boolean;
  saved_by_me: boolean;
};

/**
 * A page of the Discover feed.
 *
 * `before` is the created_at of the last post already shown, not an offset.
 * Offsets skip or repeat rows when something is posted mid-scroll, which on a
 * feed ordered by time is exactly when it happens.
 */
export async function getDiscoverFeed(options?: {
  limit?: number;
  before?: string | null;
  savedOnly?: boolean;
}): Promise<DiscoverPost[]> {
  const supabase = await getServerComponentSupabase();

  const { data } = await supabase.rpc("discover_feed", {
    p_limit: options?.limit ?? 24,
    p_before: options?.before ?? undefined,
    p_saved: options?.savedOnly ?? false,
  });

  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    clubId: r.club_id,
    clubName: r.club_name,
    sessionId: r.session_id,
    kind: r.kind === "video" ? "video" : "photo",
    caption: r.caption,
    width: r.width,
    height: r.height,
    durationS: r.duration_s,
    createdAt: r.created_at,
    authorName: r.author_name,
    likeCount: Number(r.like_count),
    likedByMe: r.liked_by_me,
    savedByMe: r.saved_by_me,
  }));
}

/** The posts an admin may manage, newest first. RLS scopes this already. */
export async function getManageablePosts(): Promise<DiscoverPost[]> {
  return getDiscoverFeed({ limit: 60 });
}

export type PostStats = { likes: number; saves: number };

/**
 * Like and save counts for the posts the caller administers. Counts only --
 * who saved a post stays private to them. Empty for anyone who administers
 * nothing.
 */
export async function getPostStats(): Promise<Map<string, PostStats>> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.rpc("discover_post_stats");

  const map = new Map<string, PostStats>();
  for (const row of (data ?? []) as unknown as {
    post_id: string;
    like_count: number | string;
    save_count: number | string;
  }[]) {
    map.set(row.post_id, { likes: Number(row.like_count), saves: Number(row.save_count) });
  }
  return map;
}
