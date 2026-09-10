import { NextResponse, type NextRequest } from "next/server";
import { getSessionMember } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { getServiceSupabaseClient } from "@/lib/supabase/serverClient";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Serves a Discover photo or video, gated by the same rule as the post itself.
 *
 * Same shape as the avatar route, and for the same reason: the bucket is
 * private, so this is the only way in. The visibility check runs with the
 * CALLER's client, so RLS decides -- a post they may not see simply is not
 * returned -- and the service-role client appears only after that gate,
 * purely because signing someone else's object bypasses the storage policy.
 *
 * `?poster=1` asks for the still rather than the video, so a feed can show
 * something immediately without downloading megabytes of footage.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;

  const viewer = await getSessionMember();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await getServerComponentSupabase();
  const { data: post } = await supabase
    .from("discover_posts")
    .select("id, storage_path, poster_path")
    .eq("id", postId)
    .maybeSingle();

  // 404, not 403: saying "this exists but is not for you" is itself a
  // disclosure about another club's events.
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const wantsPoster = request.nextUrl.searchParams.get("poster") === "1";
  const path = wantsPoster ? post.poster_path : post.storage_path;
  if (!path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = getServiceSupabaseClient();
  const { data, error } = await service.storage
    .from("discover")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Private cache only. The signed URL is caller-specific and expiring, so a
  // shared cache must never hand it to anybody else.
  return NextResponse.redirect(data.signedUrl, {
    status: 307,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
