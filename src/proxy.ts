import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`, and the export is named
 * `proxy` (not `middleware`, not a default). Proxy runs on the Node.js runtime
 * by default here, and setting `export const runtime` in this file THROWS at
 * build time -- do not add one.
 *
 * This file has exactly two jobs:
 *
 *   1. Refresh the Supabase auth token and write the rotated cookies onto the
 *      response. This is what makes SSR sessions work at all -- without it the
 *      access token expires an hour into a session and every Server Component
 *      quietly starts seeing a signed-out user.
 *
 *   2. Optimistic redirect when there is no session at all.
 *
 * It deliberately does NOT check roles. Proxy runs on every request including
 * prefetches, so a database round-trip here is a performance trap. Role gating
 * lives in src/lib/auth/session.ts, which is the real security boundary --
 * Next's own docs note that Server Actions are POSTs to the route they live on,
 * so a matcher change can silently remove proxy coverage from an action.
 */

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/join",
  "/forgot-password",
  "/auth",
  "/api/payhere",
  "/api/health",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to BOTH the request (so anything downstream in this same
          // pass sees the fresh token) and the response (so the browser
          // actually keeps it). Dropping either half is the classic cause of
          // "randomly logged out" reports.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be getUser() -- this is the call that actually performs the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the auth callback routes, and the
     * PayHere webhook.
     *
     * The `api/payhere` exclusion is load-bearing and the highest-consequence,
     * lowest-visibility line in this file: PayHere posts server-to-server with
     * no cookies. If the matcher catches it, every payment notification gets
     * 307'd to /login, the body is dropped, and payments silently stop
     * settling with no error anywhere.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/payhere|auth/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)",
  ],
};
