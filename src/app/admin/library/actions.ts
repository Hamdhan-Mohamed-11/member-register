"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSecretary } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "issued", "returned", "rejected"]),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * Moves a borrow request along: approve, hand over, take back, decline.
 *
 * The authorisation is re-checked inside set_borrow_status via is_admin(), so
 * requireSecretary here is about not showing a stranger the page, not about
 * being the control. The RPC also writes the audit row and notifies the
 * member, which is why this action is so thin -- doing either of those here
 * would mean a psql fix-up silently skipped them.
 */
export async function setBorrowStatus(formData: FormData): Promise<ActionResult> {
  await requireSecretary();

  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    dueOn: formData.get("dueOn") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_borrow_status", {
    p_id: parsed.data.id,
    p_status: parsed.data.status,
    p_due_on: parsed.data.dueOn,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/library");
  return { ok: true };
}
