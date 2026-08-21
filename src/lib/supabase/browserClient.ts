"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

let client: SupabaseClient<Database> | undefined;

/**
 * Browser client for Client Components.
 *
 * `createBrowserClient` (not the plain `createClient`) is required: it stores
 * the session in COOKIES rather than localStorage, which is what lets the
 * server -- proxy, Server Components, Server Actions -- see the same session.
 * A plain client would authenticate the browser and leave every server render
 * anonymous.
 */
export function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!client) {
    client = createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return client;
}
