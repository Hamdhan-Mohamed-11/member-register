"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSecretary } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

const decisionSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Every server action opens with a require*() call. Not most of them -- every
 * one. Next treats a Server Action as a POST to whatever route it lives on, so
 * a proxy matcher change can silently remove proxy coverage; the guard has to
 * be here, in the action itself.
 *
 * The RPC re-checks the role again server-side. That duplication is deliberate:
 * this check produces a good error message, and the RPC's check is what is
 * actually load-bearing.
 */
export async function approveJoinRequest(formData: FormData): Promise<ActionResult> {
  await requireSecretary();

  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("approve_join_request", {
    p_request_id: parsed.data.requestId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/join-requests");
  return { ok: true };
}

export async function rejectJoinRequest(formData: FormData): Promise<ActionResult> {
  await requireSecretary();

  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("reject_join_request", {
    p_request_id: parsed.data.requestId,
    p_reason: parsed.data.reason ?? undefined,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/join-requests");
  return { ok: true };
}
