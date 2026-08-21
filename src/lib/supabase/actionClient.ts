import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Anon client for Server Actions and Route Handlers -- the contexts where
 * writing cookies IS allowed, so `setAll` does the real thing rather than
 * swallowing. Use this anywhere a sign-in, sign-out, or token refresh needs to
 * persist.
 *
 * Not memoized: it closes over this request's cookie store.
 */
export async function getActionSupabase(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
