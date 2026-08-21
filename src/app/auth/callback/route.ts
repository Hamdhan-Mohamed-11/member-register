import { NextResponse, type NextRequest } from "next/server";
import { getActionSupabase } from "@/lib/supabase/actionClient";

/**
 * Single PKCE landing point for every Supabase Auth email link: signup
 * confirmation, invite acceptance, and password recovery. Supabase appends
 * `?code=...`; we exchange it for a session (which sets the cookies) and then
 * send the user wherever the flow should continue.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");

  // Same-origin relative paths only -- this endpoint is reachable by anyone
  // with a link, so an unchecked `next` is an open redirect.
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/feed";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired or already-used link. Both are common and neither is alarming.
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
