"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { parseEmailList, sendInviteEmails } from "@/lib/auth/invites";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// 'club' — members see only their own club. 'type' — members see everyone in
// every club under this type. The database is the authority on these two
// values (club_types has a CHECK); this mirrors it so the form can never post
// a third one and get a constraint error back as the user-facing message.
const VISIBILITIES = ["club", "type"] as const;

const typeSchema = z.object({
  name: z.string().trim().min(2, "Give the type a name").max(80),
  memberVisibility: z.enum(VISIBILITIES),
  requiresGuardian: z.boolean(),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export async function createClubType(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = typeSchema.safeParse({
    name: formData.get("name"),
    memberVisibility: formData.get("memberVisibility") ?? "club",
    requiresGuardian: formData.get("requiresGuardian") === "on",
    description: formData.get("description") ?? "",
    sortOrder: formData.get("sortOrder") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("create_club_type", {
    p_name: parsed.data.name,
    p_member_visibility: parsed.data.memberVisibility,
    p_requires_guardian: parsed.data.requiresGuardian,
    p_description: parsed.data.description || undefined,
    p_sort_order: parsed.data.sortOrder,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clubs");
  return { ok: true };
}

const updateTypeSchema = typeSchema.partial().extend({
  typeId: z.string().uuid(),
  isActive: z.boolean().optional(),
});

export async function updateClubType(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = updateTypeSchema.safeParse({
    typeId: formData.get("typeId"),
    name: formData.get("name") || undefined,
    memberVisibility: formData.get("memberVisibility") || undefined,
    // Unchecked boxes post nothing, so absence is false rather than "leave
    // alone". Safe because the edit form always renders every checkbox.
    requiresGuardian: formData.get("requiresGuardian") === "on",
    description: formData.get("description") ?? undefined,
    sortOrder: formData.get("sortOrder") || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("update_club_type", {
    p_type_id: parsed.data.typeId,
    p_name: parsed.data.name,
    p_member_visibility: parsed.data.memberVisibility,
    p_requires_guardian: parsed.data.requiresGuardian,
    p_description: parsed.data.description,
    p_sort_order: parsed.data.sortOrder,
    p_is_active: parsed.data.isActive,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clubs");
  revalidatePath("/join");
  return { ok: true };
}

const clubSchema = z.object({
  name: z.string().trim().min(2, "Give the club a name").max(120),
  typeId: z.string().uuid("Choose which type this club belongs to"),
  description: z.string().trim().max(500).optional(),
  feeLkr: z.coerce.number().min(0).optional(),
  termMonths: z.coerce.number().int().min(1).max(120).optional(),
  openJoin: z.boolean(),
});

export async function createClub(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = clubSchema.safeParse({
    name: formData.get("name"),
    typeId: formData.get("typeId"),
    description: formData.get("description") ?? "",
    // Blank must be undefined, not 0 -- a fee of 0 means "this club is free",
    // which is a different statement from "use the default fee".
    feeLkr: formData.get("feeLkr") || undefined,
    termMonths: formData.get("termMonths") || undefined,
    openJoin: formData.get("openJoin") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("create_public_club", {
    p_name: parsed.data.name,
    p_description: parsed.data.description || undefined,
    p_fee_lkr: parsed.data.feeLkr,
    p_term_months: parsed.data.termMonths,
    p_type_id: parsed.data.typeId,
    p_open_join: parsed.data.openJoin,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clubs");
  revalidatePath("/join");
  return { ok: true };
}

const updateClubSchema = z.object({
  clubId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  typeId: z.string().uuid().optional(),
  description: z.string().trim().max(500).optional(),
  feeLkr: z.coerce.number().min(0).optional(),
  termMonths: z.coerce.number().int().min(1).max(120).optional(),
  isActive: z.boolean(),
  openJoin: z.boolean(),
});

export async function updateClub(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = updateClubSchema.safeParse({
    clubId: formData.get("clubId"),
    name: formData.get("name") || undefined,
    typeId: formData.get("typeId") || undefined,
    description: formData.get("description") ?? undefined,
    feeLkr: formData.get("feeLkr") || undefined,
    termMonths: formData.get("termMonths") || undefined,
    isActive: formData.get("isActive") === "on",
    openJoin: formData.get("openJoin") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("update_club", {
    p_club_id: parsed.data.clubId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_fee_lkr: parsed.data.feeLkr,
    p_term_months: parsed.data.termMonths,
    p_is_active: parsed.data.isActive,
    p_type_id: parsed.data.typeId,
    p_open_join: parsed.data.openJoin,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clubs");
  revalidatePath("/join");
  return { ok: true };
}

const inviteSchema = z.object({
  clubId: z.string().uuid(),
  emails: z.string().min(3),
  role: z.enum(["member", "secretary"]),
});

export type InviteOutcome = {
  invited: string[];
  failed: { email: string; error: string }[];
};

/**
 * Invites people to any club, not just a company's.
 *
 * Same two-step as the company version and for the same reason: create_invite
 * writes the row (and is where the super-admin check lives), then the Auth
 * email goes separately because inviteUserByEmail has no SQL equivalent. One
 * bad address does not roll back the other thirty-nine.
 */
export async function inviteToClub(formData: FormData): Promise<ActionResult<InviteOutcome>> {
  await requireSuperAdmin();

  const parsed = inviteSchema.safeParse({
    clubId: formData.get("clubId"),
    emails: formData.get("emails"),
    role: formData.get("role") ?? "member",
  });
  if (!parsed.success) {
    return { ok: false, error: "Please paste at least one email address." };
  }

  const emails = parseEmailList(parsed.data.emails);
  if (emails.length === 0) {
    return { ok: false, error: "No valid email addresses found in that list." };
  }
  if (emails.length > 200) {
    return { ok: false, error: "Please invite at most 200 people at a time." };
  }

  const supabase = await getActionSupabase();
  const created: string[] = [];
  const failed: { email: string; error: string }[] = [];

  for (const email of emails) {
    const { error } = await supabase.rpc("create_invite", {
      p_email: email,
      p_club_id: parsed.data.clubId,
      p_role: parsed.data.role,
    });
    if (error) failed.push({ email, error: error.message });
    else created.push(email);
  }

  // Name the club in the email — "you have been invited" with no club named
  // reads like phishing to someone who was not expecting it.
  const { data: club } = await supabase
    .from("clubs")
    .select("name")
    .eq("id", parsed.data.clubId)
    .maybeSingle();

  const sends = await sendInviteEmails(created, club?.name ?? undefined);
  const invited: string[] = [];
  for (const send of sends) {
    if (send.ok) invited.push(send.email);
    else failed.push({ email: send.email, error: send.error ?? "Could not send" });
  }

  revalidatePath("/admin/clubs");
  return { ok: true, data: { invited, failed } };
}

const appointSchema = z.object({
  clubId: z.string().uuid(),
  // Empty means "no secretary" -- the club runs without one until appointed,
  // which is a real state and not an error.
  memberId: z.string().uuid().nullable(),
});

/**
 * Puts one member in charge of one club, or clears the post.
 *
 * The RPC does the work: it also sets or clears the `secretary` role, so a
 * club can never point at someone who cannot reach the admin area. Doing that
 * here in two calls would leave a window where the two disagree.
 */
export async function appointSecretary(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const raw = formData.get("memberId");
  const parsed = appointSchema.safeParse({
    clubId: formData.get("clubId"),
    memberId: typeof raw === "string" && raw.trim() !== "" ? raw : null,
  });
  if (!parsed.success) return { ok: false, error: "Choose a member, or none." };

  const supabase = await getActionSupabase();
  const { error } = await supabase.rpc("appoint_club_secretary", {
    p_club_id: parsed.data.clubId,
    p_member_id: parsed.data.memberId ?? undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clubs");
  revalidatePath("/admin");
  return { ok: true };
}
