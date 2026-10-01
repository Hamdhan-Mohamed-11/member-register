"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { syncStoreBooks, type SyncOutcome } from "@/lib/store/sync";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Pulls the store's catalogue in now, rather than waiting for the hourly run.
 *
 * Runs under the admin's own session, so the super-admin check inside
 * sync_store_books is the real gate and this one only saves them the trip.
 */
export async function syncCatalogueNow(): Promise<ActionResult<SyncOutcome>> {
  await requireSuperAdmin();

  try {
    const supabase = await getActionSupabase();
    const outcome = await syncStoreBooks(supabase);

    revalidatePath("/admin/shop");
    revalidatePath("/books");
    return { ok: true, data: outcome };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The sync failed.",
    };
  }
}
