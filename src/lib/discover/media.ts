/**
 * The shape of a Discover post, and where its media is fetched from.
 *
 * Deliberately separate from `queries.ts`, which is `server-only`. DiscoverCard
 * is a client component and needs both of these; importing them from the
 * server-only module dragged the Supabase server client into the browser
 * bundle and failed the build. A type would have been erased, but
 * `discoverMediaUrl` is a value, so the whole module came with it.
 */
export type DiscoverPost = {
  id: string;
  clubId: string | null;
  clubName: string | null;
  sessionId: string | null;
  kind: "photo" | "video";
  caption: string | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  createdAt: string;
  authorName: string | null;
  likeCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
};

/**
 * Where the browser fetches the media itself.
 *
 * Always this route, never a storage URL: the bucket is private, and the route
 * checks visibility before signing.
 */
export function discoverMediaUrl(postId: string, poster = false): string {
  return `/api/discover/${postId}/media${poster ? "?poster=1" : ""}`;
}
