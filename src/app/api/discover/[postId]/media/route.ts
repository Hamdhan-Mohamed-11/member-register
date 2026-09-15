import { NextResponse, type NextRequest } from "next/server";
import { getSessionMember } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { getServiceSupabaseClient } from "@/lib/supabase/serverClient";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

const POSTER_PLACEHOLDER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9" preserveAspectRatio="xMidYMid slice">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#16205c"/><stop offset="1" stop-color="#293896"/>' +
  "</linearGradient></defs>" +
  '<rect width="16" height="9" fill="url(#g)"/></svg>';

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

  if (!/^[0-9a-f-]{36}$/i.test(postId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A signed-in member: RLS decides, with their own client.
  let post: { id: string; storage_path: string; poster_path: string | null } | null = null;
  const viewer = await getSessionMember();
  if (viewer) {
    const supabase = await getServerComponentSupabase();
    const { data } = await supabase
      .from("discover_posts")
      .select("id, storage_path, poster_path")
      .eq("id", postId)
      .maybeSingle();
    post = data;
  }

  // Anyone else -- the signed-out landing page -- only for a post an admin
  // marked for the public homepage (show_on_home, 0036). Nothing else in the
  // bucket is reachable without an account.
  if (!post) {
    const { data } = await getServiceSupabaseClient()
      .from("discover_posts")
      .select("id, storage_path, poster_path")
      .eq("id", postId)
      .eq("show_on_home", true)
      .maybeSingle();
    post = data;
  }

  // 404, not 403: saying "this exists but is not for you" is itself a
  // disclosure about another club's events.
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const wantsPoster = request.nextUrl.searchParams.get("poster") === "1";
  const path = wantsPoster ? post.poster_path : post.storage_path;

  // A video posted without a still gets a plain brand-coloured frame rather
  // than a 404, which every browser draws as a broken-image icon. The page's
  // own play badge sits on top of it.
  if (wantsPoster && !path) {
    return new NextResponse(POSTER_PLACEHOLDER, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=300" },
    });
  }

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
