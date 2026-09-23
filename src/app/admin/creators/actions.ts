"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  kind: z.enum(["author", "publisher", "book"]),
  id: z.string().min(1).max(64),
  approve: z.enum(["yes", "no"]),
  reason: z.string().trim().max(500).optional(),
});

/**
 * A super admin's decision on a creator or one of their books.
 *
 * The authorisation is re-checked inside decide_creator, which also writes the
 * notification the person is waiting for -- so this action stays thin, and a
 * decision made any other way still tells them.
 */
export async function decideCreator(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = schema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    approve: formData.get("approve"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("decide_creator", {
    p_kind: parsed.data.kind,
    p_id: parsed.data.id,
    p_approve: parsed.data.approve === "yes",
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/creators");
  // An approved book joins the shop, so the listing has to be rebuilt.
  if (parsed.data.kind === "book") revalidatePath("/books");
  return { ok: true };
}
