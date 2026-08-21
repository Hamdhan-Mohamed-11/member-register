// Each NEXT_PUBLIC_ var must be accessed via a static `process.env.X`
// property read, not a dynamic `process.env[name]` lookup — Next.js can
// only inline the former into the browser bundle. A shared dynamic helper
// here would silently defeat inlining and leave `process.env.NEXT_PUBLIC_*`
// as a literal runtime lookup in client code (which is `undefined` in the
// browser, since only NEXT_PUBLIC_ vars ship there, and even those must be
// statically replaced at build time to exist at all).

export function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  return value;
}

export function getSupabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return value;
}

export function getSupabaseServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return value;
}

/**
 * Origin used to build auth redirect targets (invite links, password reset).
 * Whatever this resolves to must also be listed in the Supabase dashboard under
 * Authentication -> URL Configuration -> Redirect URLs, or the links 400.
 */
export function getSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SITE_URL");
  }
  return value.replace(/\/+$/, "");
}
