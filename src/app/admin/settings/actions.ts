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
  libraryFee: z.coerce.number().min(0).max(1_000_000),
  libraryTermMonths: z.coerce.number().int().min(1).max(120),
  readrisePercent: z.coerce.number().min(0).max(100),
  readriseBookCost: z.coerce.number().min(1).max(1_000_000),
  readriseTarget: z.coerce.number().int().min(1).max(100_000_000),
  readriseTargetOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a target date"),
});

export async function updateSettings(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = settingsSchema.safeParse({
    membershipFee: formData.get("membershipFee"),
    termMonths: formData.get("termMonths"),
    graceDays: formData.get("graceDays"),
    expiringSoonDays: formData.get("expiringSoonDays"),
    bookDiscount: formData.get("bookDiscount"),
    libraryFee: formData.get("libraryFee"),
    libraryTermMonths: formData.get("libraryTermMonths"),
    readrisePercent: formData.get("readrisePercent"),
    readriseBookCost: formData.get("readriseBookCost"),
    readriseTarget: formData.get("readriseTarget"),
    readriseTargetOn: formData.get("readriseTargetOn"),
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
    p_library_fee: parsed.data.libraryFee,
    p_library_term_months: parsed.data.libraryTermMonths,
    p_readrise_percent: parsed.data.readrisePercent,
    p_readrise_book_cost: parsed.data.readriseBookCost,
    p_readrise_target: parsed.data.readriseTarget,
    p_readrise_target_on: parsed.data.readriseTargetOn,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  // The fee shows on /library's paywall and the share shows on /cart and the
  // home page, so a price change that only lands on the settings screen is a
  // price change nobody sees.
  revalidatePath("/library");
  revalidatePath("/cart");
  revalidatePath("/feed");
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

const textsSchema = z.object({
  libraryCollectAt: z.string().trim().max(200),
  joinGuidelines: z.string().trim().max(4000),
});

/**
 * The written settings: the collection place and the join guidelines.
 *
 * Kept apart from updateSettings so a fee change and a guidelines change do
 * not overwrite each other, and so the guidelines can be long without the
 * numbers form carrying a textarea.
 */
export async function updateAppTexts(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = textsSchema.safeParse({
    libraryCollectAt: formData.get("libraryCollectAt") ?? "",
    joinGuidelines: formData.get("joinGuidelines") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid text." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("update_app_texts", {
    p_library_collect_at: parsed.data.libraryCollectAt,
    p_join_guidelines: parsed.data.joinGuidelines,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  // The guidelines are what someone ticks on the way in, so a change has to
  // reach the signed-out join page and the one after confirmation.
  revalidatePath("/join");
  revalidatePath("/pending");
  return { ok: true };
}
