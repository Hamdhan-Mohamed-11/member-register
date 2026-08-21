import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Anon client for Server Components and generateMetadata.
 *
 * Not memoized: it closes over this request's cookie store, so a module-level
 * singleton would leak one user's session into another's request.
 */
export async function getServerComponentSupabase(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies -- Next throws here. This is
          // expected and safe to swallow: src/proxy.ts refreshes the auth token
          // and writes the rotated cookies onto the response on every request,
          // so the only thing lost here is a duplicate write.
          //
          // If the proxy matcher ever stops covering a route, sessions on that
          // route will expire after an hour instead of refreshing. That is the
          // failure mode to look for.
        }
      },
    },
  });
}
