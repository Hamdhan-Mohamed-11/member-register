/**
 * Security headers, including the Content-Security-Policy.
 *
 * Kept in one place rather than inline in next.config so the reasoning for
 * each directive stays attached to it. Several of these are load-bearing in
 * ways that are silent when wrong.
 */

const SUPABASE_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
})();

// Both hosts, always. PAYHERE_MODE decides which one is used at runtime, but
// the policy is baked at build time and a staging build must not break when
// someone flips the mode.
const PAYHERE_ORIGINS = "https://sandbox.payhere.lk https://www.payhere.lk";

const VIDEO_FRAME_ORIGINS =
  "https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com";

// Book covers. Measured rather than guessed: of 13,138 books with an image,
// 13,132 are bare filenames that resolve to the legacy uploads directory and
// exactly 6 are absolute URLs, all on m.media-amazon.com. That is narrow
// enough to allowlist precisely instead of opening img-src to all of https:.
//
// If the shop ever starts using another image host, those covers will show as
// broken rather than silently loading from anywhere -- which is the trade
// being made deliberately.
const BOOK_IMAGE_ORIGINS =
  "https://www.pickabook.lk https://pickabook.lk https://m.media-amazon.com";

export function buildCsp(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    // 'unsafe-inline' is not optional here: Next inlines its RSC payload and
    // bootstrap into <script> tags. Removing it requires per-request nonces
    // through the proxy, which is a real change rather than a tightening.
    // 'unsafe-eval' is dev-only -- React Refresh needs it, production does not.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],

    // Tailwind and next/font both emit inline <style>.
    "style-src": ["'self'", "'unsafe-inline'"],

    // Avatars are served same-origin by /api/avatars, which 307s to a signed
    // Supabase URL -- so the Storage origin has to be allowed as an image
    // source even though no markup references it directly. Book covers come
    // from the legacy shop.
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      SUPABASE_ORIGIN,
      ...BOOK_IMAGE_ORIGINS.split(" "),
    ].filter(Boolean),

    "font-src": ["'self'", "data:"],

    // XHR/websocket targets. The Supabase origin covers PostgREST, Auth and
    // Realtime; ws: is the dev server's hot-reload socket.
    "connect-src": ["'self'", SUPABASE_ORIGIN, ...(isDev ? ["ws:", "wss:"] : [])].filter(Boolean),

    // Video embeds. Nothing else may be framed by us.
    "frame-src": ["'self'", ...VIDEO_FRAME_ORIGINS.split(" ")],

    // THE one that breaks payments if it says 'self'.
    //
    // Checkout works by POSTing a signed form to PayHere's own domain. With
    // form-action 'self' the browser blocks that submission silently -- the
    // button appears to do nothing, and there is no console error that names
    // the cause. It has to allow PayHere explicitly.
    "form-action": ["'self'", ...PAYHERE_ORIGINS.split(" ")],

    // Nobody may frame us. Clickjacking protection, and the modern
    // replacement for X-Frame-Options.
    "frame-ancestors": ["'none'"],

    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };

  if (!isDev) {
    directives["upgrade-insecure-requests"] = [];
  }

  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

export function securityHeaders(isDev: boolean) {
  return [
    { key: "Content-Security-Policy", value: buildCsp(isDev) },

    // Belt and braces alongside frame-ancestors, for anything that only
    // understands the older header.
    { key: "X-Frame-Options", value: "DENY" },

    // Stops the browser second-guessing a declared Content-Type, which is how
    // an uploaded file gets treated as script.
    { key: "X-Content-Type-Options", value: "nosniff" },

    // Send the origin cross-site, the full URL same-site. Member and session
    // ids live in our paths and should not leak into a third party's logs.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

    // We ask for none of these. Denying them outright means a compromised
    // dependency cannot either.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },

    // Only meaningful over HTTPS, so production only -- a dev browser that
    // caches this for localhost will refuse plain HTTP there for two years.
    ...(isDev
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]),
  ];
}
