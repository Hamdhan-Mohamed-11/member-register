import { NextResponse, type NextRequest } from "next/server";
import { getSessionMember } from "@/lib/auth/session";
import { MEMBER_VIEW_COOKIE } from "@/lib/auth/viewMode";
import { getSiteUrl } from "@/lib/supabase/env";

/**
 * /view/member -- a secretary switches to seeing their club as a member.
 * /view/admin  -- back to the admin area.
 *
 * Only a secretary may enter member view. A super admin runs every club and
 * belongs to none, so there is no member view for them to be in; a member is
 * already in it. Either is just sent where they belong.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mode: string }> },
) {
  const { mode } = await params;
  const session = await getSessionMember();
  // The public site URL, not request.nextUrl.origin: behind nginx the request
  // arrives at 127.0.0.1:3001, and a redirect built from that sends the
  // browser to an address it cannot reach. Same as /auth/signout.
  const to = (path: string) => new URL(path, getSiteUrl());

  if (!session) return NextResponse.redirect(to("/login"));

  if (mode === "member" && session.role === "secretary") {
    const response = NextResponse.redirect(to("/feed"));
    response.cookies.set(MEMBER_VIEW_COOKIE, "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 12,
    });
    return response;
  }

  if (mode === "admin") {
    const response = NextResponse.redirect(
      to(session.role === "member" ? "/feed" : "/admin"),
    );
    response.cookies.delete(MEMBER_VIEW_COOKIE);
    return response;
  }

  return NextResponse.redirect(to("/home"));
}
