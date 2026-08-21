"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3, "Please say why this is being settled by hand").max(300),
});

/**
 * Records a payment as settled without a webhook.
 *
 * Two real situations need this: local development, where PayHere cannot reach
 * the machine, and the day the callback genuinely fails after money has moved.
 * It applies the SAME side effects as a real settlement, and marks the status
 * 'manual' rather than 'success' so reconciliation can tell them apart later.
 *
 * The reason is mandatory and audited -- a bare "mark as paid" button with no
 * trail is how disputes become unanswerable.
 */
export async function markPaid(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = schema.safeParse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("admin_mark_payment_paid", {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payments");
  return { ok: true };
}
