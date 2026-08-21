import { NextResponse, type NextRequest } from "next/server";
import { getSessionMember } from "@/lib/auth/session";
import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { getServiceSupabaseClient } from "@/lib/supabase/serverClient";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Serves a member's avatar, gated by the same visibility rule as their profile.
 *
 * The avatars bucket is PRIVATE, so this is the only way to see someone else's
 * photo. The flow is: confirm the caller may see this member at all, then mint
 * a short-lived signed URL and redirect to it.
 *
 * The visibility check is done with the CALLER's client, so RLS does the
 * deciding -- if profiles returns no row, they cannot see this person, and we
 * never reach the service-role client. The service client appears only after
 * that gate, purely because signing a URL for someone else's object needs to
 * bypass the owner-only storage policy.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await params;

  const viewer = await getSessionMember();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS decides. A member the caller cannot see simply is not returned.
  const supabase = await getServerComponentSupabase();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, avatar_path")
    .eq("id", profileId)
    .maybeSingle();

  // 404 rather than 403 -- telling a stranger "this person exists but you may
  // not see them" is itself a disclosure.
  if (!target?.avatar_path) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = getServiceSupabaseClient();
  const { data, error } = await service.storage
    .from("avatars")
    .createSignedUrl(target.avatar_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Private cache only: the signed URL is caller-specific and expiring, so a
  // shared cache must never hand it to someone else.
  return NextResponse.redirect(data.signedUrl, {
    status: 307,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
