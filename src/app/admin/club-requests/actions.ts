"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  id: z.string().uuid(),
  approve: z.enum(["yes", "no"]),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Approves or declines a club application.
 *
 * Approving is what CREATES the club -- private, with the applicant as its
 * admin -- so all of it happens inside decide_club_request, in one
 * transaction. Doing the creation here would leave a decided application with
 * no club behind it the first time something failed halfway.
 */
export async function decideClubRequest(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = schema.safeParse({
    id: formData.get("id"),
    approve: formData.get("approve"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("decide_club_request", {
    p_request_id: parsed.data.id,
    p_approve: parsed.data.approve === "yes",
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/club-requests");
  revalidatePath("/admin/clubs");
  return { ok: true };
}
