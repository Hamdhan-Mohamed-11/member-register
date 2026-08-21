"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { parseEmailList, sendInviteEmails } from "@/lib/auth/invites";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const createSchema = z.object({
  name: z.string().trim().min(2, "Company name is too short").max(120),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional(),
  clubName: z.string().trim().max(120).optional(),
  feeLkr: z.coerce.number().min(0).optional(),
  termMonths: z.coerce.number().int().min(1).max(120).optional(),
});

export async function createCompany(formData: FormData): Promise<ActionResult<{ companyId: string }>> {
  await requireSuperAdmin();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    contactEmail: formData.get("contactEmail") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    clubName: formData.get("clubName") ?? "",
    // Empty strings must become undefined, not 0 -- a fee of 0 means "this
    // club is free", which is a different thing from "use the default".
    feeLkr: formData.get("feeLkr") || undefined,
    termMonths: formData.get("termMonths") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  const supabase = await getActionSupabase();
  const { data, error } = await supabase.rpc("create_company_with_club", {
    p_name: parsed.data.name,
    p_contact_email: parsed.data.contactEmail || undefined,
    p_contact_phone: parsed.data.contactPhone || undefined,
    p_club_name: parsed.data.clubName || undefined,
    p_fee_lkr: parsed.data.feeLkr,
    p_term_months: parsed.data.termMonths,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/companies");
  const row = Array.isArray(data) ? data[0] : undefined;
  return { ok: true, data: { companyId: row?.company_id as string } };
}

const inviteSchema = z.object({
  clubId: z.string().uuid(),
  emails: z.string().min(3),
});

export type InviteOutcome = {
  invited: string[];
  failed: { email: string; error: string }[];
};

/**
 * Bulk-invites employees to a company club.
 *
 * Two-step per address on purpose: create_invite writes the row (and is where
 * the super-admin check and the duplicate-account check actually happen), then
 * the Auth email is sent separately because inviteUserByEmail has no SQL
 * equivalent.
 *
 * Failures are collected per address rather than aborting the batch. Pasting
 * forty employees and having the whole thing roll back because one already has
 * an account would be miserable, and the partial result is genuinely useful.
 */
export async function inviteEmployees(formData: FormData): Promise<ActionResult<InviteOutcome>> {
  await requireSuperAdmin();

  const parsed = inviteSchema.safeParse({
    clubId: formData.get("clubId"),
    emails: formData.get("emails"),
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
      p_role: "member",
    });
    if (error) failed.push({ email, error: error.message });
    else created.push(email);
  }

  // Only mail the ones whose invite row exists.
  const sends = await sendInviteEmails(created);
  const invited: string[] = [];
  for (const send of sends) {
    if (send.ok) invited.push(send.email);
    else failed.push({ email: send.email, error: send.error ?? "Could not send" });
  }

  revalidatePath("/admin/companies");
  return { ok: true, data: { invited, failed } };
}
