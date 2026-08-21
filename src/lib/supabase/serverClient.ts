import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

let client: SupabaseClient<Database> | undefined;

/**
 * Service-role client. Has BYPASSRLS -- none of the policies apply to it, and
 * `auth.uid()` is null underneath it, so every visibility and ownership rule in
 * the schema is silently off.
 *
 * Only three kinds of call site are allowed to use this, and each must assert
 * the caller's role in code first (via src/lib/auth/session.ts) and write an
 * admin_audit_log row:
 *
 *   1. invite creation, which needs auth.admin.inviteUserByEmail
 *   2. the PayHere notify webhook, where no user session exists at all
 *   3. repair/backfill scripts
 *
 * If you are reaching for this to "just make a query work", the answer is
 * almost always a missing policy or grant instead.
 */
export function getServiceSupabaseClient(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
