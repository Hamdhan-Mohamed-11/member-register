"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";

export type ActionResult = { ok: true } | { ok: false; error: string };

const roleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["member", "secretary", "super_admin"]),
});

export async function setMemberRole(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = roleSchema.safeParse({
    memberId: formData.get("memberId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid role." };

  const supabase = await getActionSupabase();
  // The RPC refuses to demote the last active super admin, which is the guard
  // that matters -- this action only produces a nicer message.
  const { error } = await supabase.rpc("set_member_role", {
    p_member_id: parsed.data.memberId,
    p_role: parsed.data.role,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return { ok: true };
}

const statusSchema = z.object({
  memberId: z.string().uuid(),
  status: z.enum(["pending", "active", "suspended", "rejected"]),
});

export async function setMemberStatus(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = statusSchema.safeParse({
    memberId: formData.get("memberId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("set_member_status", {
    p_member_id: parsed.data.memberId,
    p_status: parsed.data.status,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return { ok: true };
}

const addClubSchema = z.object({
  memberId: z.string().uuid(),
  clubId: z.string().uuid(),
  months: z.coerce.number().int().min(1).max(120).optional(),
});

export async function addClubMembership(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const raw = formData.get("months");
  const parsed = addClubSchema.safeParse({
    memberId: formData.get("memberId"),
    clubId: formData.get("clubId"),
    months: raw && String(raw).trim() !== "" ? raw : undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid club." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("admin_add_club_membership", {
    p_member_id: parsed.data.memberId,
    p_club_id: parsed.data.clubId,
    ...(parsed.data.months != null ? { p_months: parsed.data.months } : {}),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return { ok: true };
}

const membershipSchema = z.object({
  memberId: z.string().uuid(),
  membershipId: z.string().uuid(),
  status: z.enum(["pending", "active", "expired", "cancelled", "rejected"]).optional(),
  renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function setMembership(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const status = formData.get("status");
  const renewal = formData.get("renewalDate");

  const parsed = membershipSchema.safeParse({
    memberId: formData.get("memberId"),
    membershipId: formData.get("membershipId"),
    status: status && String(status).trim() !== "" ? status : undefined,
    renewalDate: renewal && String(renewal).trim() !== "" ? renewal : undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid membership change." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("admin_set_membership", {
    p_membership_id: parsed.data.membershipId,
    ...(parsed.data.status ? { p_status: parsed.data.status } : {}),
    ...(parsed.data.renewalDate ? { p_renewal_date: parsed.data.renewalDate } : {}),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return { ok: true };
}
