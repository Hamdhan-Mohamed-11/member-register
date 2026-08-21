"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const settingsSchema = z.object({
  membershipFee: z.coerce.number().min(0).max(1_000_000),
  termMonths: z.coerce.number().int().min(1).max(120),
  graceDays: z.coerce.number().int().min(0).max(365),
  expiringSoonDays: z.coerce.number().int().min(1).max(365),
  bookDiscount: z.coerce.number().min(0).max(100),
});

export async function updateSettings(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = settingsSchema.safeParse({
    membershipFee: formData.get("membershipFee"),
    termMonths: formData.get("termMonths"),
    graceDays: formData.get("graceDays"),
    expiringSoonDays: formData.get("expiringSoonDays"),
    bookDiscount: formData.get("bookDiscount"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("update_app_settings", {
    p_membership_fee: parsed.data.membershipFee,
    p_term_months: parsed.data.termMonths,
    p_grace_days: parsed.data.graceDays,
    p_expiring_soon_days: parsed.data.expiringSoonDays,
    p_book_discount: parsed.data.bookDiscount,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true };
}

const ruleSchema = z.object({
  code: z.string().min(1).max(40),
  points: z.coerce.number().int().min(0).max(1000),
});

export async function updatePointsRule(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = ruleSchema.safeParse({
    code: formData.get("code"),
    points: formData.get("points"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid points value." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("update_points_rule", {
    p_code: parsed.data.code,
    p_points: parsed.data.points,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true };
}
